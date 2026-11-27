"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import {
  attributeAssessment,
  characters,
  gameDecisions,
  onboardingProfiles,
  profiles,
  skills,
} from "@/lib/db/schema";
import { PART_KEYS } from "@/lib/game/attributes";
import { avatarSchema } from "@/lib/game/avatar";
import { mainSlots, secondarySlots } from "@/lib/game/formulas";
import {
  AGE_BANDS,
  assessCharacter,
  GOALS,
  GROUPS,
  OCCUPATIONS,
  PRESET_SKILLS,
  targetLevelForHours,
  type Locale,
} from "@/lib/game/onboarding";
import { getLocale } from "next-intl/server";
import { mutateAndRecompute, type MutationResult } from "@/lib/server/game/mutate";
import { LlmError } from "@/lib/server/llm/checkin";
import { suggestSleepingSkillsWithLlm, type SleepingSuggestion } from "@/lib/server/llm/sleeping";
import { requireUserId } from "@/lib/server/session";

const part = z.enum(PART_KEYS);

const answersSchema = z.object({
  ageBand: z.enum(AGE_BANDS as [string, ...string[]]).nullable(),
  occupations: z.array(z.enum(OCCUPATIONS.map((o) => o.key) as [string, ...string[]])).max(8),
  groups: z.array(z.enum(GROUPS.map((g) => g.key) as [string, ...string[]])).max(6),
  otherGroup: z.string().trim().max(120).optional(),
  goals: z.array(z.enum(GOALS.map((g) => g.key) as [string, ...string[]])).max(3),
  timezone: z.string().min(1).max(64),
});

export async function saveOnboardingAnswers(input: z.input<typeof answersSchema>) {
  const userId = await requireUserId();
  const a = answersSchema.parse(input);
  const tz = isValidTimeZone(a.timezone) ? a.timezone : "UTC";
  await withUser(userId, async (tx) => {
    const values = {
      ageBand: a.ageBand,
      occupations: a.occupations,
      groups: a.groups,
      goals: a.goals,
      aboutText: a.otherGroup || null,
    };
    await tx
      .insert(onboardingProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: onboardingProfiles.userId, set: values });
    await tx.update(profiles).set({ timezone: tz }).where(eq(profiles.id, userId));
  });
  revalidatePath("/onboarding");
}

const sleepingSchema = z.object({
  name: z.string().trim().min(2).max(60),
  hours: z.number().min(1).max(30_000),
  primary: part,
  secondary: part.nullable(),
});

export async function addSleepingSkill(input: z.input<typeof sleepingSchema>) {
  const userId = await requireUserId();
  const s = sleepingSchema.parse(input);
  await withUser(userId, async (tx) => {
    const [row] = await tx
      .insert(skills)
      .values({
        userId,
        name: s.name,
        primaryAttrKey: s.primary,
        secondaryAttrKey: s.secondary === s.primary ? null : s.secondary,
        status: "sleeping",
        sleepingPastHours: s.hours,
        sleepingTargetLevel: targetLevelForHours(s.hours),
      })
      .returning({ id: skills.id });
    await tx.insert(gameDecisions).values({
      userId,
      kind: "add_sleeping_skill",
      payload: { skillId: row.id },
    });
  });
  revalidatePath("/onboarding");
}

export async function removeSleepingSkill(skillId: string) {
  const userId = await requireUserId();
  z.uuid().parse(skillId);
  await withUser(userId, async (tx) => {
    // спящий навык без опыта можно убрать полностью, вместе с решением о добавлении
    await tx
      .delete(gameDecisions)
      .where(and(eq(gameDecisions.userId, userId), sql`${gameDecisions.payload}->>'skillId' = ${skillId}`));
    await tx
      .delete(skills)
      .where(and(eq(skills.id, skillId), eq(skills.userId, userId), eq(skills.status, "sleeping")));
  });
  revalidatePath("/onboarding");
}

const starterSchema = z.object({
  main: z.array(z.string()).max(mainSlots(1)),
  secondary: z.array(z.string()).max(secondarySlots(1)),
});

export async function takeStarterSkills(input: z.input<typeof starterSchema>) {
  const userId = await requireUserId();
  const s = starterSchema.parse(input);
  const locale = (await getLocale()) as Locale;
  const picks = [
    ...s.main.map((k) => ({ k, slot: "main" as const })),
    ...s.secondary.map((k) => ({ k, slot: "secondary" as const })),
  ].filter((p) => PRESET_SKILLS[p.k]);
  if (new Set(picks.map((p) => p.k)).size !== picks.length) throw new Error("duplicate_skill");

  await withUser(userId, async (tx) => {
    const existing = await tx.select({ name: skills.name }).from(skills).where(eq(skills.userId, userId));
    const names = new Set(existing.map((e) => e.name.toLowerCase()));
    for (const p of picks) {
      const preset = PRESET_SKILLS[p.k];
      const name = locale === "en" ? preset.en : preset.ru;
      if (names.has(name.toLowerCase())) continue;
      const [row] = await tx
        .insert(skills)
        .values({
          userId,
          name,
          scope: locale === "en" ? preset.scope_en : preset.scope_ru,
          domain: preset.domain,
          primaryAttrKey: preset.primary,
          secondaryAttrKey: preset.secondary,
          isWorkShift: preset.isWorkShift,
          isRest: preset.isRest,
          slot: p.slot,
        })
        .returning({ id: skills.id });
      await tx.insert(gameDecisions).values({
        userId,
        kind: "take_skill",
        payload: { skillId: row.id, slot: p.slot },
      });
    }
  });
  revalidatePath("/onboarding");
}

/** Стартовая оценка по спящим навыкам и группам; пишет решение assessment. */
export async function runAssessment(): Promise<MutationResult> {
  const userId = await requireUserId();
  const locale = (await getLocale()) as Locale;
  const res = await mutateAndRecompute(userId, async (tx) => {
    const already = await tx
      .select({ id: gameDecisions.id })
      .from(gameDecisions)
      .where(and(eq(gameDecisions.userId, userId), eq(gameDecisions.kind, "assessment")));
    if (already.length > 0) return;
    const [ob] = await tx.select().from(onboardingProfiles).where(eq(onboardingProfiles.userId, userId));
    const sleeping = await tx
      .select()
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.status, "sleeping")));
    const a = assessCharacter(
      sleeping
        .filter((s) => s.primaryAttrKey && s.sleepingPastHours)
        .map((s) => ({
          name: s.name,
          hours: s.sleepingPastHours ?? 0,
          primary: s.primaryAttrKey as (typeof PART_KEYS)[number],
          secondary: (s.secondaryAttrKey as (typeof PART_KEYS)[number] | null) ?? null,
        })),
      ob?.groups ?? [],
      locale,
    );
    await tx.insert(gameDecisions).values({ userId, kind: "assessment", payload: { bonuses: a.bonuses } });
    const values = { values: a.values, explanations: a.reasons };
    await tx
      .insert(attributeAssessment)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: attributeAssessment.userId, set: values });
  });
  revalidatePath("/", "layout");
  return res;
}

const calibrationSchema = z.object({
  kind: z.enum(["start", "unfold"]),
  general: z.enum(["body", "mind", "spirit"]).optional(),
  values: z.record(z.string(), z.number().int().min(10).max(40)),
});

export async function calibrate(input: z.input<typeof calibrationSchema>): Promise<MutationResult> {
  const userId = await requireUserId();
  const c = calibrationSchema.parse(input);
  const res = await mutateAndRecompute(userId, async (tx) => {
    await tx.insert(gameDecisions).values({ userId, kind: "calibration_move", payload: c });
  });
  revalidatePath("/", "layout");
  return res;
}

export async function finishCalibration(input: { kind: "start" | "unfold"; general?: string }) {
  const userId = await requireUserId();
  const c = calibrationSchema.pick({ kind: true, general: true }).parse(input);
  const res = await mutateAndRecompute(userId, async (tx) => {
    await tx.insert(gameDecisions).values({ userId, kind: "calibration_finish", payload: c });
  });
  revalidatePath("/", "layout");
  return res;
}

const finishSchema = z.object({ gameName: z.string().trim().min(1).max(40), avatar: avatarSchema });

export async function finishOnboarding(input: z.input<typeof finishSchema>): Promise<MutationResult> {
  const userId = await requireUserId();
  const f = finishSchema.parse(input);
  const res = await mutateAndRecompute(userId, async (tx) => {
    await tx
      .update(characters)
      .set({ gameName: f.gameName, avatarConfig: f.avatar })
      .where(eq(characters.userId, userId));
    await tx
      .insert(onboardingProfiles)
      .values({ userId, completedAt: new Date() })
      .onConflictDoUpdate({ target: onboardingProfiles.userId, set: { completedAt: new Date() } });
  });
  revalidatePath("/", "layout");
  return res;
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const storySchema = z.string().trim().min(5).max(2000);

/** Свободный рассказ «что я уже умею» → предложения спящих навыков (ничего не сохраняет). */
export async function suggestSleepingSkills(
  text: string,
): Promise<{ suggestions?: SleepingSuggestion[]; error?: string }> {
  await requireUserId();
  const v = storySchema.safeParse(text);
  if (!v.success) return { error: "checkin_too_short" };
  try {
    return { suggestions: await suggestSleepingSkillsWithLlm(v.data) };
  } catch (e) {
    if (e instanceof LlmError) return { error: `llm_${e.code}` };
    throw e;
  }
}

"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser, type Tx } from "@/lib/db";
import {
  characters,
  gameDecisions,
  hpDays,
  skillCandidates,
  skillSpecializations,
  skills,
} from "@/lib/db/schema";
import { GENERAL_KEYS, isPartKey, PART_KEYS } from "@/lib/game/attributes";
import { avatarSchema } from "@/lib/game/avatar";
import { GAME_CONFIG } from "@/lib/game/config";
import { isIsoDate } from "@/lib/game/dates";
import { mainSlots, secondarySlots } from "@/lib/game/formulas";
import { mutateAndRecompute, type MutationResult } from "@/lib/server/game/mutate";
import { requireUserId } from "@/lib/server/session";

export type ActionResult = MutationResult & { error?: string };

const slotSchema = z.enum(["main", "secondary"]);

class ActionError extends Error {}

async function run(userId: string, fn: (tx: Tx) => Promise<void>): Promise<ActionResult> {
  try {
    const res = await mutateAndRecompute(userId, fn);
    revalidatePath("/", "layout");
    return res;
  } catch (e) {
    if (e instanceof ActionError) return { messages: [], error: e.message };
    throw e;
  }
}

/** Свободно ли место в слоте (по уровню персонажа). */
async function assertSlotFree(tx: Tx, userId: string, slot: "main" | "secondary", exceptSkill?: string) {
  const [c] = await tx.select({ level: characters.levelCache }).from(characters).where(eq(characters.userId, userId));
  const capacity = slot === "main" ? mainSlots(c?.level ?? 1) : secondarySlots(c?.level ?? 1);
  const used = (
    await tx
      .select({ id: skills.id })
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.status, "active"), eq(skills.slot, slot)))
  ).filter((s) => s.id !== exceptSkill).length;
  if (used >= capacity) throw new ActionError("slots_full");
}

// ───────── предложения навыков ─────────

const offerSchema = z.object({ clusterKey: z.string().min(1).max(200), slot: slotSchema });

export async function takeOfferedSkill(input: z.input<typeof offerSchema>): Promise<ActionResult> {
  const userId = await requireUserId();
  const o = offerSchema.parse(input);
  return run(userId, async (tx) => {
    const [cand] = await tx
      .select()
      .from(skillCandidates)
      .where(and(eq(skillCandidates.userId, userId), eq(skillCandidates.clusterKey, o.clusterKey)));
    if (!cand) throw new ActionError("not_found");
    await assertSlotFree(tx, userId, o.slot);
    const tags = (cand.attributeTags ?? {}) as { primary?: string; secondary?: string };
    const [row] = await tx
      .insert(skills)
      .values({
        userId,
        name: cand.suggestedName ?? cand.clusterKey,
        scope: cand.scope,
        clusterKey: cand.clusterKey,
        primaryAttrKey: tags.primary && isPartKey(tags.primary) ? tags.primary : null,
        secondaryAttrKey: tags.secondary && isPartKey(tags.secondary) ? tags.secondary : null,
        isWorkShift: cand.isWorkShift,
        slot: o.slot,
      })
      .returning({ id: skills.id });
    await tx.insert(gameDecisions).values({
      userId,
      kind: "take_skill",
      payload: { skillId: row.id, slot: o.slot, clusterKey: cand.clusterKey },
    });
  });
}

export async function snoozeOffer(clusterKey: string): Promise<ActionResult> {
  const userId = await requireUserId();
  z.string().min(1).parse(clusterKey);
  return run(userId, async (tx) => {
    await tx.insert(gameDecisions).values({ userId, kind: "snooze_skill", payload: { clusterKey } });
  });
}

export async function declineOffer(clusterKey: string): Promise<ActionResult> {
  const userId = await requireUserId();
  z.string().min(1).parse(clusterKey);
  return run(userId, async (tx) => {
    await tx.insert(gameDecisions).values({ userId, kind: "decline_skill", payload: { clusterKey } });
  });
}

// ───────── навыки ─────────

const moveSchema = z.object({ skillId: z.uuid(), slot: slotSchema });

export async function moveSkill(input: z.input<typeof moveSchema>): Promise<ActionResult> {
  const userId = await requireUserId();
  const m = moveSchema.parse(input);
  return run(userId, async (tx) => {
    const [s] = await tx.select().from(skills).where(and(eq(skills.id, m.skillId), eq(skills.userId, userId)));
    if (!s) throw new ActionError("not_found");
    if (s.slot === m.slot && s.status === "active") return;
    const cooldown = GAME_CONFIG.slots.swapCooldownDays * 86_400_000;
    if (s.status === "active" && s.slotChangedAt && Date.now() - s.slotChangedAt.getTime() < cooldown) {
      throw new ActionError("slot_cooldown");
    }
    await assertSlotFree(tx, userId, m.slot, s.id);
    await tx.update(skills).set({ slotChangedAt: new Date() }).where(eq(skills.id, s.id));
    await tx.insert(gameDecisions).values({
      userId,
      kind: s.status === "archived" ? "restore_skill" : "move_slot",
      payload: { skillId: s.id, slot: m.slot },
    });
  });
}

export async function archiveSkill(skillId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  z.uuid().parse(skillId);
  return run(userId, async (tx) => {
    await tx
      .update(skills)
      .set({ archivedAt: new Date() })
      .where(and(eq(skills.id, skillId), eq(skills.userId, userId)));
    await tx.insert(gameDecisions).values({ userId, kind: "archive_skill", payload: { skillId } });
  });
}

const specSchema = z.object({
  skillId: z.uuid(),
  milestone: z.number().int(),
  name: z.string().trim().min(2).max(60),
});

export async function chooseSpecialization(input: z.input<typeof specSchema>): Promise<ActionResult> {
  const userId = await requireUserId();
  const s = specSchema.parse(input);
  if (!(GAME_CONFIG.specialization.milestones as readonly number[]).includes(s.milestone)) {
    return { messages: [], error: "bad_milestone" };
  }
  return run(userId, async (tx) => {
    await tx
      .insert(skillSpecializations)
      .values({ skillId: s.skillId, userId, milestoneLevel: s.milestone, name: s.name })
      .onConflictDoUpdate({
        target: [skillSpecializations.skillId, skillSpecializations.milestoneLevel],
        set: { name: s.name, chosenAt: new Date() },
      });
    await tx.insert(gameDecisions).values({ userId, kind: "choose_specialization", payload: s });
  });
}

// ───────── раскрытие ─────────

const generalSchema = z.enum(GENERAL_KEYS);

export async function unfoldAttribute(general: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const g = generalSchema.parse(general);
  return run(userId, async (tx) => {
    await tx.insert(gameDecisions).values({ userId, kind: "unfold", payload: { general: g } });
  });
}

export async function declineUnfold(general: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const g = generalSchema.parse(general);
  return run(userId, async (tx) => {
    await tx.insert(gameDecisions).values({ userId, kind: "decline_unfold", payload: { general: g } });
  });
}

// ───────── самочувствие ─────────

const wellbeingSchema = z.object({
  date: z.string().refine(isIsoDate),
  sleepHours: z.number().min(0).max(16).nullable().optional(),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  sick: z.boolean().optional(),
  manualRest: z.boolean().optional(),
});

export async function setWellbeing(input: z.input<typeof wellbeingSchema>): Promise<ActionResult> {
  const userId = await requireUserId();
  const w = wellbeingSchema.parse(input);
  return run(userId, async (tx) => {
    const set: Partial<typeof hpDays.$inferInsert> = {};
    if (w.sleepHours !== undefined) set.sleepHours = w.sleepHours;
    if (w.mood !== undefined) set.mood1to5 = w.mood;
    if (w.sick !== undefined) set.sick = w.sick;
    if (w.manualRest !== undefined) set.manualRest = w.manualRest;
    await tx
      .insert(hpDays)
      .values({ userId, date: w.date, hpMax: 0, hpMorning: 0, hpCurrent: 0, ...set })
      .onConflictDoUpdate({ target: [hpDays.userId, hpDays.date], set });
  });
}


const tagsSchema = z.object({
  skillId: z.uuid(),
  primary: z.enum(PART_KEYS),
  secondary: z.enum(PART_KEYS).nullable(),
});

/** Теги характеристик навыка. Применяются ко всей истории навыка (пересчёт). */
export async function setSkillTags(input: z.input<typeof tagsSchema>): Promise<ActionResult> {
  const userId = await requireUserId();
  const v = tagsSchema.parse(input);
  return run(userId, async (tx) => {
    await tx
      .update(skills)
      .set({ primaryAttrKey: v.primary, secondaryAttrKey: v.secondary === v.primary ? null : v.secondary })
      .where(and(eq(skills.id, v.skillId), eq(skills.userId, userId)));
  });
}

const characterSchema = z.object({
  avatar: avatarSchema,
  gameName: z.string().trim().min(1).max(40).optional(),
});

/** Внешность и имя персонажа. На игру не влияют, пересчёт не нужен. */
export async function saveCharacter(input: z.input<typeof characterSchema>): Promise<ActionResult> {
  const userId = await requireUserId();
  const v = characterSchema.parse(input);
  await withUser(userId, async (tx) => {
    await tx
      .update(characters)
      .set({ avatarConfig: v.avatar, ...(v.gameName ? { gameName: v.gameName } : {}), updatedAt: new Date() })
      .where(eq(characters.userId, userId));
  });
  revalidatePath("/", "layout");
  return { messages: [] };
}

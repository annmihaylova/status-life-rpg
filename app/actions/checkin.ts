"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, withUser } from "@/lib/db";
import {
  activityEntries,
  checkins,
  entrySkillAllocations,
  hpDays,
  profiles,
  skillCandidates,
  skills,
} from "@/lib/db/schema";
import { normalizeCheckin } from "@/lib/checkin/normalize";
import type { CheckinContext } from "@/lib/checkin/schema";
import { GAME_CONFIG } from "@/lib/game/config";
import { addDays, localDate } from "@/lib/game/dates";
import { confirmDrafts } from "@/lib/server/game/drafts";
import { mutateAndRecompute } from "@/lib/server/game/mutate";
import { recomputeUser } from "@/lib/server/game/recompute";
import { LlmError, parseCheckinWithLlm } from "@/lib/server/llm/checkin";
import { LLM_CONFIG } from "@/lib/server/llm/config";
import { takeLlmSlot } from "@/lib/server/rate-limit";
import { requireUserId } from "@/lib/server/session";
import type { ActionResult } from "./game";

const submitSchema = z.object({
  day: z.enum(["today", "yesterday"]),
  transcript: z.string().trim().min(10).max(LLM_CONFIG.maxTranscriptChars),
});

/**
 * Вечерний отчёт (SPEC 4.2): текст → Claude → черновики. Черновики не дают опыта,
 * пока их не подтвердят. Сон и самочувствие из отчёта сразу идут в HP.
 */
export async function submitCheckin(
  input: z.input<typeof submitSchema>,
): Promise<{ checkinId?: string; error?: string }> {
  const userId = await requireUserId();
  const parsedInput = submitSchema.safeParse(input);
  if (!parsedInput.success) return { error: "checkin_too_short" };
  const v = parsedInput.data;
  // лимит вызовов Claude: в минуту и в месяц (lib/server/rate-limit.ts)
  const limited = await takeLlmSlot(adminDb(), userId);
  if (limited) return { error: limited };

  // контекст и запись отчёта — от имени пользователя (RLS)
  const prep = await withUser(userId, async (tx) => {
    const [p] = await tx.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.id, userId));
    const today = localDate(new Date(), p?.tz || "UTC");
    const date = v.day === "today" ? today : addDays(today, -1);

    const skillRows = await tx
      .select({ id: skills.id, name: skills.name, scope: skills.scope })
      .from(skills)
      .where(and(eq(skills.userId, userId), ne(skills.status, "archived")));
    const candRows = await tx
      .select({ cluster: skillCandidates.clusterKey, name: skillCandidates.suggestedName })
      .from(skillCandidates)
      .where(
        and(
          eq(skillCandidates.userId, userId),
          inArray(skillCandidates.offerStatus, ["accruing", "offered", "snoozed"]),
        ),
      );
    const dayRows = await tx
      .select()
      .from(activityEntries)
      .where(and(eq(activityEntries.userId, userId), eq(activityEntries.date, date)));
    const allocRows = dayRows.length
      ? await tx
          .select({ entryId: entrySkillAllocations.entryId, name: skills.name, cluster: entrySkillAllocations.activityCluster })
          .from(entrySkillAllocations)
          .leftJoin(skills, eq(skills.id, entrySkillAllocations.skillId))
          .where(inArray(entrySkillAllocations.entryId, dayRows.map((d) => d.id)))
      : [];

    const skillRefs = new Map<string, string>();
    const entryRefs = new Map<string, string>();
    const ctx: CheckinContext = {
      date,
      skills: skillRows.map((s, i) => {
        skillRefs.set(`s${i + 1}`, s.id);
        return { ref: `s${i + 1}`, name: s.name, scope: s.scope };
      }),
      candidates: candRows.map((c) => ({ cluster: c.cluster, name: c.name ?? c.cluster })),
      dayEntries: dayRows
        .filter((d) => !d.mergeWith)
        .map((d, i) => {
          entryRefs.set(`e${i + 1}`, d.id);
          return {
            ref: `e${i + 1}`,
            description: d.description,
            minutes: d.focusMinutes,
            skills: allocRows.filter((a) => a.entryId === d.id).map((a) => a.name ?? a.cluster ?? ""),
          };
        }),
    };

    const [row] = await tx
      .insert(checkins)
      .values({ userId, date, transcript: v.transcript, status: "pending" })
      .returning({ id: checkins.id });
    return { ctx, skillRefs, entryRefs, checkinId: row.id, date };
  });

  let raw;
  try {
    raw = await parseCheckinWithLlm(prep.ctx, v.transcript);
  } catch (e) {
    if (e instanceof LlmError) return { error: `llm_${e.code}` };
    throw e;
  }
  const n = normalizeCheckin(raw, { skills: prep.skillRefs, entries: prep.entryRefs });

  await withUser(userId, async (tx) => {
    for (const c of n.clusters) {
      await tx
        .insert(skillCandidates)
        .values({
          userId,
          clusterKey: c.cluster,
          suggestedName: c.name,
          scope: c.scope,
          attributeTags: { primary: c.primary, secondary: c.secondary },
          isWorkShift: c.isWorkShift,
        })
        .onConflictDoUpdate({
          target: [skillCandidates.userId, skillCandidates.clusterKey],
          set: {
            suggestedName: sql`coalesce(${skillCandidates.suggestedName}, ${c.name})`,
            scope: sql`case when ${skillCandidates.scope} = '' then ${c.scope} else ${skillCandidates.scope} end`,
            attributeTags: sql`coalesce(${skillCandidates.attributeTags}, ${JSON.stringify({ primary: c.primary, secondary: c.secondary })}::jsonb)`,
          },
        });
    }
    const restClusters = new Set(n.clusters.filter((c) => c.isRest).map((c) => c.cluster));

    for (const e of n.entries) {
      const [row] = await tx
        .insert(activityEntries)
        .values({
          userId,
          date: prep.date,
          focusMinutes: e.focusMinutes,
          intensity: e.intensity,
          novelty: e.novelty,
          description: e.description,
          source: "checkin",
          status: "draft",
          isRest: e.isRest || e.allocations.some((a) => a.cluster && restClusters.has(a.cluster)),
          attributeTags: e.attributeTags,
          confidence: e.confidence,
          evidence: e.quote,
          checkinId: prep.checkinId,
          mergeWith: e.mergeWith,
        })
        .returning({ id: activityEntries.id });
      if (e.allocations.length) {
        await tx.insert(entrySkillAllocations).values(
          e.allocations.map((a) => ({
            entryId: row.id,
            userId,
            skillId: a.skillId,
            activityCluster: a.cluster,
            share: a.share,
          })),
        );
      }
    }

    const w = n.wellbeing;
    const set: Partial<typeof hpDays.$inferInsert> = {};
    if (w.sleepHours != null) set.sleepHours = w.sleepHours;
    if (w.mood != null) set.mood1to5 = w.mood;
    if (w.sick != null) set.sick = w.sick;
    if (w.restDay != null) set.llmRestDay = w.restDay;
    if (Object.keys(set).length) {
      await tx
        .insert(hpDays)
        .values({ userId, date: prep.date, hpMax: 0, hpMorning: 0, hpCurrent: 0, ...set })
        .onConflictDoUpdate({ target: [hpDays.userId, hpDays.date], set });
    }

    await tx
      .update(checkins)
      .set({ status: "parsed", llmRaw: { output: raw, questions: n.questions } })
      .where(eq(checkins.id, prep.checkinId));
  });

  // самочувствие меняет HP — пересчитываем (черновики на опыт не влияют)
  await recomputeUser(adminDb(), userId);
  revalidatePath("/", "layout");
  return { checkinId: prep.checkinId };
}

const draftEditSchema = z.object({
  id: z.uuid(),
  minutes: z.number().int().min(GAME_CONFIG.entry.focusMinutes.min).max(GAME_CONFIG.entry.focusMinutes.max).optional(),
  intensity: z.number().min(GAME_CONFIG.entry.intensity.min).max(GAME_CONFIG.entry.intensity.max).optional(),
  novelty: z.number().min(GAME_CONFIG.entry.novelty.min).max(GAME_CONFIG.entry.novelty.max).optional(),
  isRest: z.boolean().optional(),
});

/** Правка черновика (минуты, интенсивность, новизна, отдых). Опыт не меняется до подтверждения. */
export async function updateDraft(input: z.input<typeof draftEditSchema>): Promise<ActionResult> {
  const userId = await requireUserId();
  const v = draftEditSchema.parse(input);
  await withUser(userId, async (tx) => {
    await tx
      .update(activityEntries)
      .set({
        ...(v.minutes !== undefined ? { focusMinutes: v.minutes } : {}),
        ...(v.intensity !== undefined ? { intensity: v.intensity } : {}),
        ...(v.novelty !== undefined ? { novelty: v.novelty } : {}),
        ...(v.isRest !== undefined ? { isRest: v.isRest } : {}),
      })
      .where(and(eq(activityEntries.id, v.id), eq(activityEntries.userId, userId), eq(activityEntries.status, "draft")));
  });
  revalidatePath("/checkin", "layout");
  return { messages: [] };
}

/** Разделить черновик на два с половиной времени в каждом. */
export async function splitDraft(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  z.uuid().parse(id);
  await withUser(userId, async (tx) => {
    const [d] = await tx
      .select()
      .from(activityEntries)
      .where(and(eq(activityEntries.id, id), eq(activityEntries.userId, userId), eq(activityEntries.status, "draft")));
    if (!d || d.focusMinutes < 2) return;
    const half = Math.floor(d.focusMinutes / 2);
    await tx.update(activityEntries).set({ focusMinutes: d.focusMinutes - half, mergeWith: null }).where(eq(activityEntries.id, id));
    const { id: _old, createdAt: _c, ...copy } = d;
    void _old;
    void _c;
    const [row] = await tx
      .insert(activityEntries)
      .values({ ...copy, focusMinutes: half, mergeWith: null })
      .returning({ id: activityEntries.id });
    const allocs = await tx.select().from(entrySkillAllocations).where(eq(entrySkillAllocations.entryId, id));
    if (allocs.length) {
      await tx.insert(entrySkillAllocations).values(
        allocs.map((a) => ({ entryId: row.id, userId, skillId: a.skillId, activityCluster: a.activityCluster, share: a.share })),
      );
    }
  });
  revalidatePath("/checkin", "layout");
  return { messages: [] };
}

/** «Подтвердить всё»: все черновики этого отчёта (со слиянием дублей) + пересчёт. */
export async function confirmCheckin(checkinId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  z.uuid().parse(checkinId);
  const res = await mutateAndRecompute(userId, async (tx) => {
    const drafts = await tx
      .select({ id: activityEntries.id })
      .from(activityEntries)
      .where(
        and(
          eq(activityEntries.userId, userId),
          eq(activityEntries.checkinId, checkinId),
          eq(activityEntries.status, "draft"),
        ),
      );
    await confirmDrafts(
      tx,
      userId,
      drafts.map((d) => d.id),
    );
    await tx
      .update(checkins)
      .set({ status: "confirmed" })
      .where(and(eq(checkins.id, checkinId), eq(checkins.userId, userId)));
  });
  revalidatePath("/", "layout");
  return res;
}

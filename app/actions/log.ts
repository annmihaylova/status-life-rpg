"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { activityEntries, entrySkillAllocations, profiles, skillCandidates, skills } from "@/lib/db/schema";
import { GAME_CONFIG } from "@/lib/game/config";
import { addDays, localDate } from "@/lib/game/dates";
import { confirmDrafts } from "@/lib/server/game/drafts";
import { mutateAndRecompute } from "@/lib/server/game/mutate";
import { requireUserId } from "@/lib/server/session";
import { clusterKeyOf } from "@/lib/checkin/normalize";
import type { ActionResult } from "./game";

const { intensity, novelty, focusMinutes } = GAME_CONFIG.entry;

const logSchema = z
  .object({
    skillId: z.uuid().nullable(),
    /** новая активность, которой ещё нет среди навыков: станет кандидатом */
    newActivity: z.string().trim().min(2).max(60).nullable(),
    minutes: z.number().int().min(focusMinutes.min).max(focusMinutes.max),
    intensity: z.number().min(intensity.min).max(intensity.max),
    novelty: z.number().min(novelty.min).max(novelty.max),
    day: z.enum(["today", "yesterday"]),
    isRest: z.boolean(),
    description: z.string().trim().max(300).optional(),
  })
  .refine((v) => Boolean(v.skillId) !== Boolean(v.newActivity), { message: "skill_or_activity" });


export async function logActivity(input: z.input<typeof logSchema>): Promise<ActionResult> {
  const userId = await requireUserId();
  const v = logSchema.parse(input);
  const res = await mutateAndRecompute(userId, async (tx) => {
    const [p] = await tx.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.id, userId));
    const today = localDate(new Date(), p?.tz || "UTC");
    const date = v.day === "today" ? today : addDays(today, -1);

    let skillName: string | null = null;
    let cluster: string | null = null;
    if (v.skillId) {
      const [s] = await tx
        .select({ name: skills.name })
        .from(skills)
        .where(and(eq(skills.id, v.skillId), eq(skills.userId, userId)));
      if (!s) throw new Error("skill_not_found");
      skillName = s.name;
    } else {
      cluster = clusterKeyOf(v.newActivity!);
      skillName = v.newActivity!;
      await tx
        .insert(skillCandidates)
        .values({ userId, clusterKey: cluster, suggestedName: v.newActivity! })
        .onConflictDoNothing();
    }

    const [entry] = await tx
      .insert(activityEntries)
      .values({
        userId,
        date,
        startedAt: new Date(),
        focusMinutes: v.minutes,
        intensity: v.intensity,
        novelty: v.novelty,
        description: v.description || skillName,
        source: "manual",
        status: "confirmed",
        confirmedAt: new Date(),
        isRest: v.isRest,
      })
      .returning({ id: activityEntries.id });
    await tx.insert(entrySkillAllocations).values({
      entryId: entry.id,
      userId,
      skillId: v.skillId,
      activityCluster: cluster,
      share: 1,
    });
  });
  revalidatePath("/", "layout");
  return res;
}

export async function deleteEntry(entryId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  z.uuid().parse(entryId);
  const res = await mutateAndRecompute(userId, async (tx) => {
    await tx
      .delete(activityEntries)
      .where(and(eq(activityEntries.id, entryId), eq(activityEntries.userId, userId)));
  });
  revalidatePath("/", "layout");
  return res;
}

export async function confirmEntry(entryId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  z.uuid().parse(entryId);
  const res = await mutateAndRecompute(userId, (tx) => confirmDrafts(tx, userId, [entryId]));
  revalidatePath("/", "layout");
  return res;
}

const timerSchema = z.object({
  skillId: z.uuid(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  /** «сколько из этого времени ты реально была в фокусе» (SPEC 4.3), по умолчанию 85 */
  focusPercent: z.number().int().min(10).max(100),
  intensity: z.number().min(intensity.min).max(intensity.max),
  novelty: z.number().min(novelty.min).max(novelty.max),
});

/** Запись по таймеру: длительность считает сервер по меткам, фокус — доля от неё. */
export async function logTimer(input: z.input<typeof timerSchema>): Promise<ActionResult> {
  const userId = await requireUserId();
  const v = timerSchema.parse(input);
  const start = new Date(v.startedAt);
  const end = new Date(v.endedAt);
  const elapsed = (end.getTime() - start.getTime()) / 60_000;
  if (end.getTime() > Date.now() + 60_000 || elapsed < 1 || elapsed > focusMinutes.max) {
    return { messages: [], error: "bad_timer" };
  }
  const minutes = Math.min(focusMinutes.max, Math.max(focusMinutes.min, Math.round((elapsed * v.focusPercent) / 100)));
  const res = await mutateAndRecompute(userId, async (tx) => {
    const [p] = await tx.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.id, userId));
    const [s] = await tx
      .select({ name: skills.name, isRest: skills.isRest })
      .from(skills)
      .where(and(eq(skills.id, v.skillId), eq(skills.userId, userId)));
    if (!s) throw new Error("skill_not_found");
    const [entry] = await tx
      .insert(activityEntries)
      .values({
        userId,
        date: localDate(start, p?.tz || "UTC"),
        startedAt: start,
        focusMinutes: minutes,
        intensity: v.intensity,
        novelty: v.novelty,
        description: s.name,
        source: "timer",
        status: "confirmed",
        confirmedAt: new Date(),
        isRest: s.isRest,
        evidence: `таймер ${Math.round(elapsed)} мин, фокус ${v.focusPercent}%`,
      })
      .returning({ id: activityEntries.id });
    await tx.insert(entrySkillAllocations).values({ entryId: entry.id, userId, skillId: v.skillId, share: 1 });
  });
  revalidatePath("/", "layout");
  return res;
}

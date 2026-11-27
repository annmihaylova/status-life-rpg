"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { activityEntries, entrySkillAllocations, profiles, skillCandidates, skills } from "@/lib/db/schema";
import { GAME_CONFIG } from "@/lib/game/config";
import { addDays, localDate } from "@/lib/game/dates";
import { mutateAndRecompute } from "@/lib/server/game/mutate";
import { requireUserId } from "@/lib/server/session";
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

/** Ключ кластера из названия активности: стабильный и читаемый. */
function clusterKeyOf(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

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
  const res = await mutateAndRecompute(userId, async (tx) => {
    await tx
      .update(activityEntries)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(
        and(
          eq(activityEntries.id, entryId),
          eq(activityEntries.userId, userId),
          eq(activityEntries.status, "draft"),
        ),
      );
  });
  revalidatePath("/", "layout");
  return res;
}

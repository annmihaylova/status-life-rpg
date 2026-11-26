import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { adminDb, withUser } from "@/lib/db";
import {
  activityEntries,
  characters,
  entrySkillAllocations,
  gameDecisions,
  onboardingProfiles,
  profiles,
  skillCandidates,
  skills,
} from "@/lib/db/schema";
import { addDays, localDate, type IsoDate } from "@/lib/game/dates";
import { replay } from "@/lib/game/engine/replay";
import type { EngineInput, EngineResult } from "@/lib/game/engine/types";
import { loadEngineInput } from "./load";

export type SkillRow = typeof skills.$inferSelect;
export type CandidateRow = typeof skillCandidates.$inferSelect;

export async function getOnboardingState(userId: string) {
  return withUser(userId, async (tx) => {
    const [p] = await tx.select().from(onboardingProfiles).where(eq(onboardingProfiles.userId, userId));
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId));
    const [character] = await tx.select().from(characters).where(eq(characters.userId, userId));
    const skillRows = await tx.select().from(skills).where(eq(skills.userId, userId));
    return { onboarding: p ?? null, profile, character, skills: skillRows };
  });
}

export interface GameView {
  today: IsoDate;
  input: EngineInput;
  result: EngineResult;
  character: typeof characters.$inferSelect;
  skills: SkillRow[];
  candidates: CandidateRow[];
  declinedUnfold: Set<string>;
  /** минуты фокуса по навыку: всего и по дням за 30 дней (для спарклайнов) */
  skillMinutes: Map<string, { total: number; byDay: Map<IsoDate, number> }>;
  todayXp: number;
}

/**
 * Полная игровая картина пользователя для экранов: пересчёт движком «на лету»
 * (детерминированный и дешёвый) + имена и метаданные из таблиц.
 */
export async function getGameView(userId: string): Promise<GameView> {
  const now = new Date();
  const { input } = await loadEngineInput(adminDb(), userId, now);
  const result = replay(input);

  const data = await withUser(userId, async (tx) => {
    const [character] = await tx.select().from(characters).where(eq(characters.userId, userId));
    const skillRows = await tx.select().from(skills).where(eq(skills.userId, userId));
    const candRows = await tx.select().from(skillCandidates).where(eq(skillCandidates.userId, userId));
    const declines = await tx
      .select({ payload: gameDecisions.payload })
      .from(gameDecisions)
      .where(and(eq(gameDecisions.userId, userId), eq(gameDecisions.kind, "decline_unfold")));
    return { character, skillRows, candRows, declines };
  });

  const since = addDays(input.today, -29);
  const skillMinutes = new Map<string, { total: number; byDay: Map<IsoDate, number> }>();
  const clusterToSkill = new Map<string, string>();
  for (const d of input.decisions) {
    if (d.kind === "take_skill" && d.payload.clusterKey) clusterToSkill.set(d.payload.clusterKey, d.payload.skillId);
  }
  for (const e of input.entries) {
    for (const a of e.allocations) {
      const id = a.skillId ?? (a.cluster ? clusterToSkill.get(a.cluster) : undefined);
      if (!id) continue;
      const m = e.focusMinutes * a.share;
      const s = skillMinutes.get(id) ?? { total: 0, byDay: new Map() };
      s.total += m;
      if (e.date >= since) s.byDay.set(e.date, (s.byDay.get(e.date) ?? 0) + m);
      skillMinutes.set(id, s);
    }
  }

  const todayEntryIds = new Set(input.entries.filter((e) => e.date === input.today).map((e) => e.id));
  const todayXp = result.ledger
    .filter((l) => l.targetType === "character" && todayEntryIds.has(l.entryId))
    .reduce((s, l) => s + l.amount, 0);

  return {
    today: input.today,
    input,
    result,
    character: data.character,
    skills: data.skillRows,
    candidates: data.candRows,
    declinedUnfold: new Set(
      data.declines.map((d) => String((d.payload as { general?: string }).general ?? "")),
    ),
    skillMinutes,
    todayXp,
  };
}

export interface JournalEntry {
  id: string;
  date: IsoDate;
  description: string;
  focusMinutes: number;
  intensity: number;
  novelty: number;
  source: string;
  status: string;
  isRest: boolean;
  skills: { name: string; share: number }[];
}

export async function getJournal(userId: string, days = 60): Promise<JournalEntry[]> {
  return withUser(userId, async (tx) => {
    const [profile] = await tx.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.id, userId));
    const today = localDate(new Date(), profile?.tz || "UTC");
    const rows = await tx
      .select()
      .from(activityEntries)
      .where(and(eq(activityEntries.userId, userId), gte(activityEntries.date, addDays(today, -days))))
      .orderBy(desc(activityEntries.date), desc(activityEntries.createdAt));
    const allocs = await tx
      .select({
        entryId: entrySkillAllocations.entryId,
        share: entrySkillAllocations.share,
        skillName: skills.name,
        cluster: entrySkillAllocations.activityCluster,
        candidateName: skillCandidates.suggestedName,
      })
      .from(entrySkillAllocations)
      .leftJoin(skills, eq(skills.id, entrySkillAllocations.skillId))
      .leftJoin(
        skillCandidates,
        and(
          eq(skillCandidates.userId, entrySkillAllocations.userId),
          eq(skillCandidates.clusterKey, entrySkillAllocations.activityCluster),
        ),
      )
      .where(eq(entrySkillAllocations.userId, userId));
    const byEntry = new Map<string, { name: string; share: number }[]>();
    for (const a of allocs) {
      const list = byEntry.get(a.entryId) ?? [];
      list.push({ name: a.skillName ?? a.candidateName ?? a.cluster ?? "—", share: a.share });
      byEntry.set(a.entryId, list);
    }
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      focusMinutes: r.focusMinutes,
      intensity: r.intensity,
      novelty: r.novelty,
      source: r.source,
      status: r.status,
      isRest: r.isRest,
      skills: byEntry.get(r.id) ?? [],
    }));
  });
}

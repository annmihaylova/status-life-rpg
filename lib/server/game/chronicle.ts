import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { weeklyChronicles } from "@/lib/db/schema";
import {
  allTimeCounters,
  compareWithPast,
  heatmap,
  letterWeekStart,
  periodSummary,
  type AllTimeCounters,
  type PeriodSummary,
  type Snapshot,
} from "@/lib/game/chronicle";
import { addDays, type IsoDate } from "@/lib/game/dates";
import { weekStartOf } from "@/lib/game/progression";
import { getGameView } from "./queries";

export interface ChronicleView {
  today: IsoDate;
  compare: { past: Snapshot; now: Snapshot; days: number };
  week: PeriodSummary;
  month: PeriodSummary;
  allTime: AllTimeCounters;
  heat: ReturnType<typeof heatmap>;
  letter: {
    weekStart: IsoDate;
    summary: PeriodSummary;
    prev: PeriodSummary;
    /** текст от Claude (сохранён через MCP), если есть */
    claudeText: string | null;
  };
  skillName: Map<string, string>;
}

export async function getChronicle(userId: string): Promise<ChronicleView> {
  const view = await getGameView(userId);
  const { input, result, today } = view;
  const ws = weekStartOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const lw = letterWeekStart(today);

  const saved = await withUser(userId, (tx) =>
    tx
      .select({ weekStart: weeklyChronicles.weekStart, letter: weeklyChronicles.letterText })
      .from(weeklyChronicles)
      .where(and(eq(weeklyChronicles.userId, userId), gte(weeklyChronicles.weekStart, lw)))
      .orderBy(desc(weeklyChronicles.weekStart))
      .limit(1),
  );

  const letterWeek = saved[0]?.letter ? saved[0].weekStart : lw;
  return {
    today,
    compare: compareWithPast(input, result, 30),
    week: periodSummary(input, result, ws, today),
    month: periodSummary(input, result, monthStart, today),
    allTime: allTimeCounters(input, result),
    heat: heatmap(input, 26),
    letter: {
      weekStart: letterWeek,
      summary: periodSummary(input, result, letterWeek, addDays(letterWeek, 6)),
      prev: periodSummary(input, result, addDays(letterWeek, -7), addDays(letterWeek, -1)),
      claudeText: saved[0]?.letter ?? null,
    },
    skillName: new Map(view.skills.map((s) => [s.id, s.name])),
  };
}

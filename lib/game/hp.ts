/**
 * HP — текущее состояние персонажа (SPEC 2.6, 3.5). HP никогда ничего не отнимает:
 * не уменьшает XP и не «убивает» персонажа, только показывает состояние.
 */
import { GAME_CONFIG as C, type Experiments, type RestDayVariant } from "./config";

export type StatusEffect = "lack_of_sleep" | "overload" | "unwell" | "recovery" | "second_wind";

export interface HpDayEntry {
  focusMinutes: number;
  intensity: number;
  /** отдых, прогулки, хобби, общение с близкими */
  isRest: boolean;
}

export interface HpCheckin {
  sleepHours: number | null;
  mood1to5?: number | null;
  sick: boolean;
}

export interface HpInput {
  /** Выносливость, а пока Тело не раскрыто — Тело */
  enduranceValue: number;
  characterLevel: number;
  entries: readonly HpDayEntry[];
  checkin: HpCheckin | null;
  /** вчерашний день был днём отдыха → бафф «Восстановление» */
  yesterdayWasRestDay: boolean;
  /** сегодня действует «Второе дыхание» */
  secondWindActive: boolean;
}

export interface HpResult {
  max: number;
  morning: number;
  current: number;
  effects: StatusEffect[];
  /** при HP < 30% Система мягко советует отдых */
  suggestRest: boolean;
}

export function hpMax(enduranceValue: number, characterLevel: number, sick = false): number {
  const h = C.hp;
  const raw =
    h.base +
    h.perEndurancePoint * (enduranceValue - C.attributes.base) +
    h.perLevel * (characterLevel - 1);
  const withSick = sick ? raw * (1 - h.sickMaxPenalty) : raw;
  return Math.max(1, Math.round(withSick));
}

/** Доля утреннего HP по сну. null — данных нет. */
export function morningFraction(sleepHours: number | null): number {
  if (sleepHours == null || !Number.isFinite(sleepHours)) return C.hp.noDataFraction;
  for (const s of C.hp.sleep) if (sleepHours >= s.minHours) return s.fraction;
  return C.hp.sleep[C.hp.sleep.length - 1].fraction;
}

export function computeHp(input: HpInput): HpResult {
  const h = C.hp;
  const sick = input.checkin?.sick ?? false;
  const max = hpMax(input.enduranceValue, input.characterLevel, sick);
  const sleep = input.checkin?.sleepHours ?? null;
  const morning = Math.round(max * morningFraction(sleep));

  let heavyMinutes = 0;
  let totalFocus = 0;
  let restMinutes = 0;
  for (const e of input.entries) {
    if (e.isRest) {
      restMinutes += e.focusMinutes;
      continue;
    }
    totalFocus += e.focusMinutes;
    if (e.intensity >= h.heavyIntensity) heavyMinutes += e.focusMinutes;
  }

  const overload = totalFocus > h.overloadMinutes;
  // нагрузка считается пропорционально минутам: −4% за каждые 60 минут
  let fraction = morning / max;
  fraction -= (heavyMinutes / 60) * h.heavyLossPer60Min;
  if (overload) fraction -= h.overloadLoss;

  const low = fraction < h.lowThreshold;
  const mult = low ? h.lowRestMultiplier : 1;
  const restGain = Math.min(
    h.restGainMaxPerDay * mult,
    (restMinutes / 30) * h.restGainPer30Min * mult,
  );
  fraction += restGain;
  fraction = Math.min(1, Math.max(h.floorFraction, fraction));

  const effects: StatusEffect[] = [];
  if (sleep != null && sleep < h.lackOfSleepHours) effects.push("lack_of_sleep");
  if (overload) effects.push("overload");
  if (sick) effects.push("unwell");
  if (input.yesterdayWasRestDay) effects.push("recovery");
  if (input.secondWindActive) effects.push("second_wind");

  const current = Math.round(max * fraction);
  return { max, morning, current, effects, suggestRest: current < max * h.lowThreshold };
}

/**
 * День отдыха → бафф «Восстановление» на следующий день (PLAN 2б).
 * Ручная отметка «сегодня отдыхала» засчитывается в любом варианте.
 */
export function isRestDay(input: {
  variant: RestDayVariant;
  entries: readonly HpDayEntry[];
  manualRestMark: boolean;
  /** вариант C: решение LLM по вечернему отчёту */
  llmSaysRestDay?: boolean | null;
}): boolean {
  if (input.manualRestMark) return true;
  switch (input.variant) {
    case "A": {
      const cfg = C.experiments.restDay.A;
      let nonRest = 0;
      let rest = 0;
      for (const e of input.entries) {
        if (e.isRest) rest += e.focusMinutes;
        else nonRest += e.focusMinutes;
      }
      return nonRest < cfg.maxNonRestMinutes && rest >= cfg.minRestMinutes;
    }
    case "B":
      return false;
    case "C":
      return input.llmSaysRestDay === true;
  }
}

/** Бонусы «Второго дыхания» на день `daysSinceReturn` (0 — день возвращения). */
export function secondWindBonus(
  experiments: Experiments,
  breakDays: number,
  daysSinceReturn: number,
): { characterXpBonus: number; skillXpBonus: number; active: boolean } {
  const cfg = C.experiments.secondWind;
  const v = cfg[experiments.secondWind];
  const active =
    breakDays >= cfg.breakDays && daysSinceReturn >= 0 && daysSinceReturn < v.durationDays;
  return active
    ? { characterXpBonus: v.characterXpBonus, skillXpBonus: v.skillXpBonus, active }
    : { characterXpBonus: 0, skillXpBonus: 0, active: false };
}

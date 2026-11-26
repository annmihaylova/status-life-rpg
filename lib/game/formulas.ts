/**
 * Чистые игровые формулы (SPEC раздел 3). Никаких обращений к БД, времени или случайности.
 * Эталон — scripts/balance.py. 1 XP ≈ 1 минута фокуса обычной интенсивности.
 */
import { GAME_CONFIG as C } from "./config";

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ───────────────────────── Уровень персонажа (3.2) ─────────────────────────

/** XP, нужный для перехода L → L+1. */
export function xpToNextLevel(level: number): number {
  return Math.round(C.character.base * level ** C.character.exponent);
}

/** Накопленный XP, при котором достигается уровень `level` (уровень 1 = 0 XP). */
export function totalXpForLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpToNextLevel(l);
  return sum;
}

export interface LevelProgress {
  level: number;
  /** XP, набранный внутри текущего уровня */
  xpIntoLevel: number;
  /** XP, нужный на весь текущий уровень */
  xpForLevel: number;
  xpToNext: number;
}

function levelFrom(xp: number, step: (n: number) => number): LevelProgress {
  let level = 1;
  let rest = Math.max(0, xp);
  while (rest >= step(level)) {
    rest -= step(level);
    level++;
  }
  const need = step(level);
  return { level, xpIntoLevel: rest, xpForLevel: need, xpToNext: need - rest };
}

export function characterLevelFromXp(totalXp: number): LevelProgress {
  return levelFrom(totalXp, xpToNextLevel);
}

// ───────────────────────── Уровень навыка (3.3) ─────────────────────────

export function skillXpToNext(level: number): number {
  return Math.round(C.skill.base * level ** C.skill.exponent);
}

export function skillTotalXpForLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += skillXpToNext(l);
  return sum;
}

export function skillLevelFromXp(totalXp: number): LevelProgress {
  return levelFrom(totalXp, skillXpToNext);
}

export type SkillRank = (typeof C.ranks)[number]["key"];

export function skillRank(level: number): SkillRank {
  for (const r of C.ranks) if (level >= r.minLevel) return r.key;
  return "novice";
}

/**
 * Целевой уровень спящего навыка по оценке прошлых часов практики (SPEC 2.2):
 * уровень, которого достиг бы навык при hours×60 XP.
 */
export function sleepingTargetLevel(pastHours: number): number {
  return skillLevelFromXp(Math.max(0, pastHours) * 60).level;
}

/**
 * XP навыка с учётом множителя спящего навыка ×5 до целевого уровня (SPEC 3.1, k_sleeping).
 * Если запись перешагивает цель, буст действует только на часть до цели.
 */
export function applySleepingMultiplier(
  baseXp: number,
  currentSkillXp: number,
  targetLevel: number | null,
): number {
  if (targetLevel == null || baseXp <= 0) return baseXp;
  const targetXp = skillTotalXpForLevel(targetLevel);
  const need = targetXp - currentSkillXp;
  if (need <= 0) return baseXp;
  const m = C.sleeping.multiplier;
  const boosted = baseXp * m;
  if (boosted <= need) return boosted;
  // часть базового XP, ушедшая на добор цели, умножена; остаток — обычный
  return need + (baseXp - need / m);
}

// ───────────────────────── XP записи (3.1) ─────────────────────────

export function clampIntensity(x: number): number {
  return clamp(x, C.entry.intensity.min, C.entry.intensity.max);
}

export function clampNovelty(x: number): number {
  return clamp(x, C.entry.novelty.min, C.entry.novelty.max);
}

export function clampFocusMinutes(x: number): number {
  return clamp(Math.round(x), C.entry.focusMinutes.min, C.entry.focusMinutes.max);
}

/** XP_entry = focus_minutes × k_intensity × k_novelty. Это же XP персонажа. */
export function entryXp(focusMinutes: number, intensity: number, novelty: number): number {
  return clampFocusMinutes(focusMinutes) * clampIntensity(intensity) * clampNovelty(novelty);
}

/** Нормализует доли навыков к сумме 1. Пустой или нулевой ввод → пустой массив. */
export function normalizeShares<T extends { share: number }>(items: readonly T[]): T[] {
  const positive = items.filter((i) => Number.isFinite(i.share) && i.share > 0);
  const sum = positive.reduce((s, i) => s + i.share, 0);
  if (sum <= 0) return [];
  return positive.map((i) => ({ ...i, share: i.share / sum }));
}

/**
 * Средний коэффициент убывающей отдачи для `minutes` минут навыка,
 * если до этой записи за тот же день в навыке уже было `priorMinutes`.
 */
export function diminishingFactor(
  priorMinutes: number,
  minutes: number,
  isWorkShift: boolean,
): number {
  if (minutes <= 0) return 1;
  const tiers = isWorkShift ? C.diminishing.workShift : C.diminishing.normal;
  let pos = Math.max(0, priorMinutes);
  const end = pos + minutes;
  let weighted = 0;
  let lower = 0;
  for (const t of tiers) {
    const segStart = Math.max(pos, lower);
    const segEnd = Math.min(end, t.upToMinutes);
    if (segEnd > segStart) {
      weighted += (segEnd - segStart) * t.factor;
      pos = segEnd;
    }
    lower = t.upToMinutes;
    if (pos >= end) break;
  }
  return weighted / minutes;
}

/** k_attr_bonus = 1 + 0.02 × (значение основной характеристики − 10), от 1.0 до 1.3. */
export function attributeSkillBonus(primaryAttributeValue: number): number {
  const a = C.attributes;
  return 1 + clamp(a.skillBonusPerPoint * (primaryAttributeValue - a.base), 0, a.skillBonusMax);
}

export interface SkillXpInput {
  entryXp: number;
  share: number;
  /** минуты фокуса этой записи, приходящиеся на навык (focus × share) */
  skillMinutes: number;
  /** минуты этого навыка за тот же день до этой записи */
  priorSkillMinutesToday: number;
  isWorkShift: boolean;
  primaryAttributeValue: number;
  /** null — навык не спящий или уже догнал цель */
  sleepingTargetLevel: number | null;
  currentSkillXp: number;
  /** суммарный бонус специализации и баффов, например 0.1 */
  extraBonus?: number;
}

export interface SkillXpResult {
  amount: number;
  multipliers: {
    share: number;
    diminishing: number;
    attrBonus: number;
    extraBonus: number;
    sleeping: number;
  };
}

/** XP_skill = XP_entry × share × k_diminishing × k_attr_bonus × (1 + бонусы) × k_sleeping. */
export function skillXp(i: SkillXpInput): SkillXpResult {
  const dim = diminishingFactor(i.priorSkillMinutesToday, i.skillMinutes, i.isWorkShift);
  const attr = attributeSkillBonus(i.primaryAttributeValue);
  const extra = 1 + (i.extraBonus ?? 0);
  const base = i.entryXp * i.share * dim * attr * extra;
  const amount = applySleepingMultiplier(base, i.currentSkillXp, i.sleepingTargetLevel);
  return {
    amount,
    multipliers: {
      share: i.share,
      diminishing: dim,
      attrBonus: attr,
      extraBonus: extra,
      sleeping: base > 0 ? amount / base : 1,
    },
  };
}

// ───────────────────────── Слоты (2.3) ─────────────────────────

export function mainSlots(characterLevel: number): number {
  const s = C.slots.main;
  const extra = s.milestones.filter((m) => characterLevel >= m).length;
  return Math.min(s.max, s.start + extra);
}

export function secondarySlots(characterLevel: number): number {
  const s = C.slots.secondary;
  return Math.min(s.max, s.start + Math.floor(characterLevel / s.everyLevels));
}

// ───────────────────────── Характеристики (2.4, 3.4) ─────────────────────────

/** XP для перехода v → v+1. */
export function xpToNextPoint(value: number): number {
  const a = C.attributes;
  return Math.round(a.pointBase * (value - (a.base - 1)) ** a.pointExponent);
}

/** XP одной звезды = 1/10 очка. */
export function xpPerStar(value: number): number {
  return xpToNextPoint(value) / C.attributes.starsPerPoint;
}

/** Сколько разных активных дней нужно с прошлого очка для v → v+1. */
export function daysRequired(value: number): number {
  const d = C.attributes.daysRequired;
  return Math.min(d.max, d.start + Math.floor((value - C.attributes.base) / d.stepEvery));
}

export interface AttributeProgress {
  value: number;
  /** XP, накопленный к следующему очку */
  pool: number;
  /** разных активных дней с прошлого очка */
  activeDaysSincePoint: number;
}

export type AttributeEvent =
  | { type: "star"; value: number; stars: number }
  | { type: "point"; from: number; to: number };

/** Количество полных звёзд в прогрессе (0–10). 10 звёзд и нет очка — ждём активных дней. */
export function starsOf(p: AttributeProgress): number {
  return Math.min(C.attributes.starsPerPoint, Math.floor(p.pool / xpPerStar(p.value)));
}

/**
 * Добавляет XP характеристике за один календарный день.
 * `isNewActiveDay` — этот день ещё не засчитан как активный и в нём ≥ 15 минут с тегом.
 * Повторяет семантику simulate() из balance.py.
 */
export function addAttributeXp(
  state: AttributeProgress,
  xp: number,
  isNewActiveDay: boolean,
): { state: AttributeProgress; events: AttributeEvent[] } {
  const events: AttributeEvent[] = [];
  let { value, pool, activeDaysSincePoint } = state;
  const starsBefore = starsOf(state);
  pool += Math.max(0, xp);
  if (isNewActiveDay) activeDaysSincePoint += 1;

  let gainedPoint = false;
  while (pool >= xpToNextPoint(value) && activeDaysSincePoint >= daysRequired(value)) {
    pool -= xpToNextPoint(value);
    events.push({ type: "point", from: value, to: value + 1 });
    value += 1;
    activeDaysSincePoint = 0;
    gainedPoint = true;
  }
  const next = { value, pool, activeDaysSincePoint };
  const starsAfter = starsOf(next);
  if (gainedPoint ? starsAfter > 0 : starsAfter > starsBefore) {
    events.push({ type: "star", value, stars: starsAfter });
  }
  return { state: next, events };
}

/** Веса распределения XP навыка по тегам: основная 2/3, вторичная 1/3. */
export function attributeTagWeights(hasSecondary: boolean): {
  primary: number;
  secondary: number;
} {
  const w = C.attributes.tagWeights;
  return hasSecondary ? { primary: w.primary, secondary: w.secondary } : { primary: 1, secondary: 0 };
}

/** Можно ли предложить раскрытие общей характеристики (SPEC 2.4.4). */
export function canOfferUnfold(input: {
  characterLevel: number;
  xpSinceStart: number;
  activeDaysTotal: number;
}): boolean {
  const u = C.attributes.unfold;
  return (
    input.characterLevel >= u.minCharacterLevel &&
    input.xpSinceStart >= u.minXpSinceStart &&
    input.activeDaysTotal >= u.minActiveDays
  );
}

/**
 * Значения частей при раскрытии (SPEC 2.4.4):
 * child_i = max(10, R + round(0.5 × E × (3 × s_i − 1))), E = R − 10.
 * `shares` — доли помеченного XP по частям; нормализуются, пустые → поровну.
 */
export function unfoldValues(generalValue: number, shares: readonly number[]): number[] {
  const n = shares.length;
  const sum = shares.reduce((s, x) => s + Math.max(0, x), 0);
  const s = sum > 0 ? shares.map((x) => Math.max(0, x) / sum) : shares.map(() => 1 / n);
  const E = generalValue - C.attributes.base;
  return s.map((si) =>
    Math.max(C.attributes.base, generalValue + roundHalfUp(0.5 * E * (n * si - 1))),
  );
}

/** Python round() — банковское; в SPEC округление «по-человечески». Фиксируем half-up от нуля. */
function roundHalfUp(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** Остаток прогресса общей характеристики делится между частями по тем же долям. */
export function splitPool(pool: number, shares: readonly number[]): number[] {
  const sum = shares.reduce((s, x) => s + Math.max(0, x), 0);
  if (sum <= 0) return shares.map(() => pool / shares.length);
  return shares.map((x) => (pool * Math.max(0, x)) / sum);
}

// ───────────────────────── Оценка и калибровка (2.4.1–2.4.2) ─────────────────────────

/**
 * Ограничивает бонус оценки LLM: 0…6 на характеристику, сумма ≤ 10.
 * При превышении суммы бонусы уменьшаются начиная с наибольшего.
 */
export function clampAssessmentBonuses(bonuses: readonly number[]): number[] {
  const a = C.attributes.assessment;
  const out = bonuses.map((b) => clamp(Math.round(b), 0, a.maxPerAttribute));
  let total = out.reduce((s, x) => s + x, 0);
  while (total > a.maxTotal) {
    const i = out.indexOf(Math.max(...out));
    out[i] -= 1;
    total -= 1;
  }
  return out;
}

export interface CalibrationRules {
  pointsTotal: number;
  min: number;
  max: number;
}

/**
 * Проверяет итоговые значения калибровки: сумма сохраняется, границы соблюдены,
 * перенесено не больше `pointsTotal` очков.
 */
export function validateCalibration(
  base: readonly number[],
  next: readonly number[],
  rules: CalibrationRules,
): { ok: true; pointsUsed: number } | { ok: false; reason: string } {
  if (base.length !== next.length) return { ok: false, reason: "length_mismatch" };
  const sumBase = base.reduce((s, x) => s + x, 0);
  const sumNext = next.reduce((s, x) => s + x, 0);
  if (sumBase !== sumNext) return { ok: false, reason: "sum_changed" };
  if (next.some((v) => !Number.isInteger(v))) return { ok: false, reason: "not_integer" };
  if (next.some((v) => v < rules.min || v > rules.max)) return { ok: false, reason: "out_of_bounds" };
  const moved = next.reduce((s, v, i) => s + Math.max(0, v - base[i]), 0);
  if (moved > rules.pointsTotal) return { ok: false, reason: "too_many_points" };
  return { ok: true, pointsUsed: moved };
}

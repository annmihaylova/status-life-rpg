/**
 * Онбординг: справочники опросника, стартовые навыки по группам, оценка прошлых часов
 * и стартовая оценка характеристик (SPEC 2.4.1, 2.5).
 *
 * Оценка — прозрачная формула по часам практики и группе: каждое число объяснимо.
 * В фазе 1c к ней добавится разбор свободного текста через LLM.
 */
import { parentOf, isPartKey, GENERAL_KEYS, type GeneralKey, type PartKey } from "./attributes";
import { clampAssessmentBonuses, sleepingTargetLevel } from "./formulas";
import presets from "./data/presets.json";

export type Locale = "ru" | "en";

export interface PresetSkill {
  key: string;
  ru: string;
  en: string;
  domain: string;
  primary: PartKey;
  secondary: PartKey | null;
  scope_ru: string;
  scope_en: string;
  isWorkShift: boolean;
  isRest: boolean;
}

export interface PresetGroup {
  key: string;
  category: string;
  ru: string;
  en: string;
  skills: string[];
}

export interface PresetCategory {
  key: string;
  ru: string;
  en: string;
}

export const AGE_BANDS: readonly string[] = presets.ageBands;
export const OCCUPATIONS = presets.occupations;
export const GOALS = presets.goals;
export const GROUPS: readonly PresetGroup[] = presets.groups;
export const CATEGORIES: readonly PresetCategory[] = presets.categories;
const AGE_DEFAULTS: Record<string, string[]> = presets.ageDefaults;

export const PRESET_SKILLS: Readonly<Record<string, PresetSkill>> = Object.fromEntries(
  Object.entries(presets.skills).map(([key, s]) => {
    const raw = s as Record<string, unknown>;
    return [
      key,
      {
        key,
        ru: String(raw.ru),
        en: String(raw.en),
        domain: String(raw.domain),
        primary: raw.primary as PartKey,
        secondary: (raw.secondary as PartKey | undefined) ?? null,
        scope_ru: String(raw.scope_ru),
        scope_en: String(raw.scope_en),
        isWorkShift: raw.isWorkShift === true,
        isRest: raw.isRest === true,
      },
    ];
  }),
);

/**
 * Стартовые навыки для выбранных групп: без повторов, в порядке групп.
 * Если сфера не выбрана, подсказки берутся по возрасту (школьник, пенсионер).
 */
export function suggestedSkills(groupKeys: readonly string[], ageBand?: string | null): PresetSkill[] {
  const keys = groupKeys.length > 0 ? groupKeys : (ageBand && AGE_DEFAULTS[ageBand]) || [];
  const out: PresetSkill[] = [];
  const seen = new Set<string>();
  for (const g of GROUPS.filter((g) => keys.includes(g.key))) {
    for (const k of g.skills) {
      if (!seen.has(k) && PRESET_SKILLS[k]) {
        seen.add(k);
        out.push(PRESET_SKILLS[k]);
      }
    }
  }
  return out;
}

/**
 * Прошлые часы практики: «катаюсь 10 лет, 3 раза в неделю по 1.5 часа».
 * Без поправок на перерывы — человек сам оценивает регулярность.
 */
export function estimatePastHours(years: number, timesPerWeek: number, hoursPerSession: number): number {
  const v = Math.max(0, years) * 52 * Math.max(0, timesPerWeek) * Math.max(0, hoursPerSession);
  return Math.round(Math.min(v, 30_000));
}

export function targetLevelForHours(hours: number): number {
  return sleepingTargetLevel(hours);
}

export interface SleepingSkillInput {
  name: string;
  hours: number;
  primary: PartKey;
  secondary: PartKey | null;
}

export interface AssessmentReason {
  kind: "skill" | "group";
  label: string;
  points: number;
}

export interface Assessment {
  bonuses: Record<GeneralKey, number>;
  values: Record<GeneralKey, number>;
  reasons: Record<GeneralKey, AssessmentReason[]>;
}

/** Очки оценки за прошлые часы практики навыка. */
export function hoursToPoints(hours: number): number {
  if (hours < 20) return 0;
  if (hours < 100) return 1;
  if (hours < 300) return 2;
  if (hours < 800) return 3;
  if (hours < 2000) return 4;
  return 5;
}

const GROUP_POINTS = 1;
const MAX_GROUP_POINTS_PER_ATTRIBUTE = 2;

/**
 * Стартовая оценка: 10 + бонус. Бонус — из спящих навыков (часы → очки, основная характеристика 2/3,
 * вторичная 1/3) и из групп занятости (+1 характеристике, на которую чаще всего опираются навыки группы,
 * не больше +2 от групп). Итог ограничен: 0…6 на характеристику и ≤ 10 в сумме.
 */
export function assessCharacter(
  sleeping: readonly SleepingSkillInput[],
  groupKeys: readonly string[],
  locale: Locale = "ru",
): Assessment {
  const raw: Record<GeneralKey, number> = { body: 0, mind: 0, spirit: 0 };
  const reasons: Record<GeneralKey, AssessmentReason[]> = { body: [], mind: [], spirit: [] };

  for (const s of sleeping) {
    const p = hoursToPoints(s.hours);
    if (p === 0 || !isPartKey(s.primary)) continue;
    const parts: [PartKey, number][] = s.secondary
      ? [
          [s.primary, (p * 2) / 3],
          [s.secondary, p / 3],
        ]
      : [[s.primary, p]];
    const byGeneral = new Map<GeneralKey, number>();
    for (const [part, pts] of parts) {
      const g = parentOf(part);
      byGeneral.set(g, (byGeneral.get(g) ?? 0) + pts);
    }
    for (const [g, pts] of byGeneral) {
      raw[g] += pts;
      reasons[g].push({ kind: "skill", label: `${s.name} ~${Math.round(s.hours)} ${locale === "ru" ? "ч" : "h"}`, points: pts });
    }
  }

  const groupPoints: Record<GeneralKey, number> = { body: 0, mind: 0, spirit: 0 };
  for (const g of GROUPS.filter((g) => groupKeys.includes(g.key))) {
    const counts: Record<GeneralKey, number> = { body: 0, mind: 0, spirit: 0 };
    for (const k of g.skills) {
      const s = PRESET_SKILLS[k];
      if (s) counts[parentOf(s.primary)] += 1;
    }
    const top = GENERAL_KEYS.reduce((a, b) => (counts[b] > counts[a] ? b : a));
    if (groupPoints[top] >= MAX_GROUP_POINTS_PER_ATTRIBUTE) continue;
    groupPoints[top] += GROUP_POINTS;
    raw[top] += GROUP_POINTS;
    reasons[top].push({ kind: "group", label: locale === "ru" ? g.ru : g.en, points: GROUP_POINTS });
  }

  const clamped = clampAssessmentBonuses(GENERAL_KEYS.map((g) => Math.round(raw[g])));
  const bonuses = Object.fromEntries(GENERAL_KEYS.map((g, i) => [g, clamped[i]])) as Record<
    GeneralKey,
    number
  >;
  const values = Object.fromEntries(GENERAL_KEYS.map((g) => [g, 10 + bonuses[g]])) as Record<
    GeneralKey,
    number
  >;
  for (const g of GENERAL_KEYS) reasons[g].sort((a, b) => b.points - a.points);
  return { bonuses, values, reasons };
}

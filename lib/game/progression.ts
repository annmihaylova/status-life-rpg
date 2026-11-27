/**
 * Титулы и классы (SPEC 2.7). Чистые функции: правила титулов и выбор класса.
 * Конфиги — data/titles.json и data/classes.json (черновик, вопрос 14.5).
 *
 * Без давления (PLAN 2г): никаких титулов за серии без пропусков и за ночную работу;
 * дни с записями считаются в сумме, а не подряд.
 */
import { isGeneralKey, parentOf, type AttributeKey, type PartKey } from "./attributes";
import { diffDays, type IsoDate } from "./dates";
import classesData from "./data/classes.json";
import titlesData from "./data/titles.json";

export type TitleRule =
  | { type: "entries_total"; n: number }
  | { type: "hours_total"; n: number }
  | { type: "active_days_total"; n: number }
  | { type: "domain_entries"; domain: string; n: number }
  | { type: "domain_hours"; domain: string; n: number }
  | { type: "domains_in_day"; n: number }
  | { type: "new_skills_window"; n: number; days: number }
  | { type: "return_after_break"; days: number }
  | { type: "character_level"; n: number }
  | { type: "skill_level"; n: number }
  | { type: "skill_hours"; n: number }
  | { type: "rest_days"; n: number }
  | { type: "attribute_value"; n: number }
  | { type: "unfolded" }
  | { type: "specialization" }
  | { type: "awakened" };

export interface TitleDef {
  key: string;
  ru: string;
  en: string;
  desc_ru: string;
  desc_en: string;
  rule: TitleRule;
}

export interface ClassDef {
  key: string;
  ru: string;
  en: string;
  attrs: PartKey[];
  /** области навыков, к которым класс тяготеет; пусто — любые */
  domains: string[];
}

export const TITLES = titlesData as TitleDef[];
export const CLASSES = classesData as ClassDef[];

const titleByKey = new Map(TITLES.map((t) => [t.key, t]));
const classByKey = new Map(CLASSES.map((c) => [c.key, c]));
export const titleDef = (key: string) => titleByKey.get(key);
export const classDef = (key: string) => classByKey.get(key);

export type Locale = "ru" | "en";
export const titleName = (key: string, locale: Locale) => titleByKey.get(key)?.[locale] ?? key;
export const titleDescription = (key: string, locale: Locale) =>
  (locale === "en" ? titleByKey.get(key)?.desc_en : titleByKey.get(key)?.desc_ru) ?? "";
export const className = (key: string, locale: Locale) => classByKey.get(key)?.[locale] ?? key;

/**
 * Область навыка, если её нет в строке (навык из кандидата или придуман вручную):
 * грубая оценка по основной характеристике.
 */
const DOMAIN_BY_ATTR: Record<PartKey, string> = {
  strength: "body",
  endurance: "body",
  dexterity: "craft",
  intellect: "science",
  perception: "other",
  will: "work",
  charisma: "social",
  empathy: "care",
  creativity: "creative",
};
export function skillDomain(domain: string | null | undefined, primaryAttr: PartKey | null): string | null {
  return domain || (primaryAttr ? DOMAIN_BY_ATTR[primaryAttr] : null);
}

/** Накопленные показатели на конец дня — всё, что нужно правилам титулов. */
export interface ProgressCounters {
  date: IsoDate;
  entriesTotal: number;
  minutesTotal: number;
  activeDaysTotal: number;
  domainEntries: Record<string, number>;
  domainMinutes: Record<string, number>;
  /** области, в которых были записи сегодня */
  domainsToday: number;
  /** перерыв перед сегодняшней записью (дней), если сегодня возвращение */
  returnBreakToday: number | null;
  /** даты новых навыков: взятых из предложения Системы или пробуждённых */
  newSkillDates: IsoDate[];
  characterLevel: number;
  maxSkillLevel: number;
  maxSkillMinutes: number;
  maxAttributeValue: number;
  restDays: number;
  anyUnfolded: boolean;
  anySpecialization: boolean;
  anyAwakened: boolean;
}

export function titleMet(rule: TitleRule, c: ProgressCounters): boolean {
  switch (rule.type) {
    case "entries_total":
      return c.entriesTotal >= rule.n;
    case "hours_total":
      return c.minutesTotal >= rule.n * 60;
    case "active_days_total":
      return c.activeDaysTotal >= rule.n;
    case "domain_entries":
      return (c.domainEntries[rule.domain] ?? 0) >= rule.n;
    case "domain_hours":
      return (c.domainMinutes[rule.domain] ?? 0) >= rule.n * 60;
    case "domains_in_day":
      return c.domainsToday >= rule.n;
    case "new_skills_window":
      return c.newSkillDates.filter((d) => diffDays(c.date, d) < rule.days).length >= rule.n;
    case "return_after_break":
      return c.returnBreakToday !== null && c.returnBreakToday >= rule.days;
    case "character_level":
      return c.characterLevel >= rule.n;
    case "skill_level":
      return c.maxSkillLevel >= rule.n;
    case "skill_hours":
      return c.maxSkillMinutes >= rule.n * 60;
    case "rest_days":
      return c.restDays >= rule.n;
    case "attribute_value":
      return c.maxAttributeValue >= rule.n;
    case "unfolded":
      return c.anyUnfolded;
    case "specialization":
      return c.anySpecialization;
    case "awakened":
      return c.anyAwakened;
  }
}

/** Титулы, условия которых выполнены сегодня и которых ещё нет. */
export function newTitles(earned: ReadonlySet<string>, c: ProgressCounters): TitleDef[] {
  return TITLES.filter((t) => !earned.has(t.key) && titleMet(t.rule, c));
}

/**
 * Две самые развитые характеристики из тех, что видны сейчас (общие или раскрытые части).
 * При равенстве — больше опыта, потом порядок ключей (детерминированно).
 */
export function topAttributes(
  attrs: { key: AttributeKey; value: number; xpTotal: number; state: "general" | "unfolded" | "part" }[],
): AttributeKey[] {
  return attrs
    .filter((a) => a.state !== "unfolded")
    .sort((a, b) => b.value - a.value || b.xpTotal - a.xpTotal || a.key.localeCompare(b.key))
    .slice(0, 2)
    .map((a) => a.key);
}

/** Насколько характеристика человека совпадает с характеристикой класса. */
function attrMatch(have: AttributeKey, want: PartKey): number {
  if (have === want) return 3;
  // общая характеристика (до раскрытия) подходит ко всем своим частям, но слабее
  if (isGeneralKey(have) && parentOf(want) === have) return 1;
  return 0;
}

/**
 * Класс по двум топ-характеристикам и областям, в которых больше всего опыта
 * (`domains` отсортированы по убыванию). Раскрытие для класса не нужно.
 */
export function chooseClass(top: AttributeKey[], domains: string[]): ClassDef | null {
  let best: ClassDef | null = null;
  let bestScore = 0;
  for (const c of CLASSES) {
    // каждой характеристике человека — лучшая пара из класса, без повторов
    const [a, b] = c.attrs;
    const [x, y] = top;
    const straight = (x ? attrMatch(x, a) : 0) + (y ? attrMatch(y, b) : 0);
    const crossed = (x ? attrMatch(x, b) : 0) + (y ? attrMatch(y, a) : 0);
    const attrScore = Math.max(straight, crossed);
    if (attrScore === 0) continue;
    const domainScore = (domains[0] && c.domains.includes(domains[0]) ? 2 : 0) + (domains[1] && c.domains.includes(domains[1]) ? 1 : 0);
    const score = attrScore * 10 + domainScore;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** Классы пересчитываются раз в неделю — по понедельникам. */
export function isWeekStart(date: IsoDate): boolean {
  // 2024-01-01 — понедельник
  return ((diffDays(date, "2024-01-01") % 7) + 7) % 7 === 0;
}

/** Понедельник недели, в которую входит дата. */
export function weekStartOf(date: IsoDate): IsoDate {
  const shift = ((diffDays(date, "2024-01-01") % 7) + 7) % 7;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - shift)).toISOString().slice(0, 10);
}

/**
 * Хроника (SPEC 5.5) — «антидот от „я никуда не двигаюсь“». Чистые функции над входом и
 * результатом движка: итоги периода, счётчики за всё время, heatmap, «ты месяц назад и сейчас»
 * и письмо Системы по шаблону.
 *
 * Пустые дни в heatmap нейтральные: пропуски не наказываются и не подсвечиваются.
 */
import { GENERAL_KEYS, partsOf, type AttributeKey } from "./attributes";
import { addDays, diffDays, maxDate, type IsoDate } from "./dates";
import { replay } from "./engine/replay";
import type { EngineInput, EngineResult } from "./engine/types";
import { weekStartOf } from "./progression";

/** Минуты по навыкам и областям для одной записи (с учётом взятых из кластеров навыков). */
function entryParts(input: EngineInput) {
  const clusterToSkill = new Map<string, string>();
  for (const d of input.decisions) {
    if (d.kind === "take_skill" && d.payload.clusterKey) clusterToSkill.set(d.payload.clusterKey, d.payload.skillId);
  }
  const domainOf = new Map(input.skills.map((s) => [s.id, s.domain ?? null]));
  return (e: EngineInput["entries"][number]) => {
    const total = e.allocations.reduce((s, a) => s + a.share, 0);
    if (e.allocations.length === 0 || total <= 0) {
      return [{ skillId: null, domain: "other", minutes: e.focusMinutes }];
    }
    return e.allocations.map((a) => {
      const skillId = a.skillId ?? (a.cluster ? (clusterToSkill.get(a.cluster) ?? null) : null);
      return {
        skillId,
        domain: (skillId ? domainOf.get(skillId) : null) ?? "other",
        minutes: (e.focusMinutes * a.share) / total,
      };
    });
  };
}

export interface PeriodSummary {
  from: IsoDate;
  to: IsoDate;
  minutes: number;
  entries: number;
  activeDays: number;
  /** минуты по областям, по убыванию */
  domains: { domain: string; minutes: number }[];
  /** минуты по навыкам, по убыванию */
  skills: { skillId: string; minutes: number }[];
  xp: number;
  levelFrom: number;
  levelTo: number;
  newSkills: string[];
  rankUps: { skillId: string; rank: string }[];
  skillLevelUps: number;
  attributePoints: { attribute: AttributeKey; to: number }[];
  titles: string[];
}

/** Итоги за период [from, to] включительно. */
export function periodSummary(input: EngineInput, result: EngineResult, from: IsoDate, to: IsoDate): PeriodSummary {
  const parts = entryParts(input);
  const domains = new Map<string, number>();
  const skillMin = new Map<string, number>();
  const days = new Set<IsoDate>();
  let minutes = 0;
  let entries = 0;
  const inPeriod = (d: IsoDate) => d >= from && d <= to;
  const ids = new Set<string>();
  for (const e of input.entries) {
    if (!inPeriod(e.date)) continue;
    ids.add(e.id);
    entries += 1;
    minutes += e.focusMinutes;
    days.add(e.date);
    for (const p of parts(e)) {
      domains.set(p.domain, (domains.get(p.domain) ?? 0) + p.minutes);
      if (p.skillId) skillMin.set(p.skillId, (skillMin.get(p.skillId) ?? 0) + p.minutes);
    }
  }
  const xp = result.ledger
    .filter((l) => l.targetType === "character" && ids.has(l.entryId))
    .reduce((s, l) => s + l.amount, 0);

  const ev = result.events.filter((e) => inPeriod(e.date));
  const levelBefore = result.events
    .filter((e) => e.type === "level_up" && e.date < from)
    .reduce((m, e) => (e.type === "level_up" ? Math.max(m, e.to) : m), 1);
  const levelTo = ev.reduce((m, e) => (e.type === "level_up" ? Math.max(m, e.to) : m), levelBefore);

  const newSkills = Object.values(result.skills)
    .filter((s) => {
      const fromCluster = input.decisions.some(
        (d) => d.kind === "take_skill" && d.payload.skillId === s.id && d.payload.clusterKey && inPeriod(d.date),
      );
      return fromCluster || (s.awakenedOn !== null && inPeriod(s.awakenedOn));
    })
    .map((s) => s.id);

  const sortDesc = <K>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    from,
    to,
    minutes,
    entries,
    activeDays: days.size,
    domains: sortDesc(domains).map(([domain, m]) => ({ domain, minutes: m })),
    skills: sortDesc(skillMin).map(([skillId, m]) => ({ skillId, minutes: m })),
    xp,
    levelFrom: levelBefore,
    levelTo,
    newSkills,
    rankUps: ev.flatMap((e) => (e.type === "skill_rank_up" ? [{ skillId: e.skillId, rank: e.rank }] : [])),
    skillLevelUps: ev.filter((e) => e.type === "skill_level_up").length,
    attributePoints: ev.flatMap((e) => (e.type === "attribute_point" ? [{ attribute: e.attribute, to: e.to }] : [])),
    titles: ev.flatMap((e) => (e.type === "title_earned" ? [e.title] : [])),
  };
}

export interface AllTimeCounters {
  minutes: number;
  entries: number;
  activeDays: number;
  skills: { skillId: string; minutes: number }[];
  domains: { domain: string; minutes: number }[];
}

export function allTimeCounters(input: EngineInput, result: EngineResult): AllTimeCounters {
  const s = periodSummary(input, result, "0000-01-01", "9999-12-31");
  return { minutes: s.minutes, entries: s.entries, activeDays: s.activeDays, skills: s.skills, domains: s.domains };
}

/** Минуты по дням за последние `weeks` недель, начиная с понедельника. */
export function heatmap(input: EngineInput, weeks = 26): { start: IsoDate; days: { date: IsoDate; minutes: number }[] } {
  const start = addDays(weekStartOf(input.today), -(weeks - 1) * 7);
  const byDay = new Map<IsoDate, number>();
  for (const e of input.entries) {
    if (e.date >= start && e.date <= input.today) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.focusMinutes);
  }
  const days: { date: IsoDate; minutes: number }[] = [];
  for (let d = start; d <= input.today; d = addDays(d, 1)) days.push({ date: d, minutes: byDay.get(d) ?? 0 });
  return { start, days };
}

/** Уровень цвета клетки 0–4: 0 — пусто (нейтрально), дальше по часам. */
export function heatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 60) return 1;
  if (minutes < 180) return 2;
  if (minutes < 360) return 3;
  return 4;
}

export interface Snapshot {
  date: IsoDate;
  level: number;
  totalXp: number;
  /** видимые характеристики: общие или части раскрытых */
  attributes: { key: AttributeKey; value: number }[];
  skills: { skillId: string; level: number; xp: number }[];
}

function snapshotOf(date: IsoDate, r: EngineResult): Snapshot {
  const attributes: { key: AttributeKey; value: number }[] = [];
  for (const g of GENERAL_KEYS) {
    const a = r.attributes[g];
    if (!a) continue;
    if (a.state === "unfolded") {
      for (const p of partsOf(g)) {
        const c = r.attributes[p];
        if (c) attributes.push({ key: p, value: c.value });
      }
    } else attributes.push({ key: g, value: a.value });
  }
  return {
    date,
    level: r.character.level,
    totalXp: r.character.totalXp,
    attributes,
    skills: Object.values(r.skills)
      .filter((s) => s.status === "active" || s.status === "sleeping")
      .map((s) => ({ skillId: s.id, level: s.level, xp: s.xp }))
      .sort((a, b) => b.xp - a.xp),
  };
}

/**
 * «Ты N дней назад и сейчас». Прошлое состояние — тот же движок по записям и решениям до той даты.
 * Если человек с нами меньше N дней, сравниваем с днём регистрации.
 */
export function compareWithPast(
  input: EngineInput,
  result: EngineResult,
  daysAgo = 30,
): { past: Snapshot; now: Snapshot; days: number } {
  const pastDate = maxDate(addDays(input.today, -daysAgo), input.registeredOn);
  const pastInput: EngineInput = {
    ...input,
    today: pastDate,
    entries: input.entries.filter((e) => e.date <= pastDate),
    decisions: input.decisions.filter((d) => d.date <= pastDate),
  };
  const past = snapshotOf(pastDate, replay(pastInput));
  return { past, now: snapshotOf(input.today, result), days: diffDays(input.today, pastDate) };
}

/**
 * Неделя для письма: с пятницы — текущая (она уже почти прожита), раньше — прошлая полная.
 */
export function letterWeekStart(today: IsoDate): IsoDate {
  const ws = weekStartOf(today);
  return diffDays(today, ws) >= 4 ? ws : addDays(ws, -7);
}

/** Строка письма: ключ перевода `chronicle.letter.*` + значения. */
export interface LetterLine {
  key: string;
  values?: Record<string, string | number>;
}

/**
 * Письмо Системы по шаблону: тёплое и конкретное, без лести и без упрёков за пропуски.
 * Имена навыков и областей подставляет вызывающий код (`name`).
 */
export function templateLetter(
  week: PeriodSummary,
  prev: PeriodSummary | null,
  name: {
    skill: (id: string) => string;
    domain: (d: string) => string;
    title: (k: string) => string;
    rank: (r: string) => string;
  },
): LetterLine[] {
  const lines: LetterLine[] = [];
  if (week.entries === 0) {
    lines.push({ key: "quiet" });
    if (prev && prev.entries > 0) lines.push({ key: "quietPrev", values: { hours: hours(prev.minutes) } });
    lines.push({ key: "quietEnd" });
    return lines;
  }
  lines.push({ key: "opening", values: { hours: hours(week.minutes), days: week.activeDays, entries: week.entries } });
  const top = week.skills[0];
  if (top) lines.push({ key: "topSkill", values: { skill: name.skill(top.skillId), hours: hours(top.minutes) } });
  if (week.domains.length >= 3) {
    lines.push({ key: "breadth", values: { count: week.domains.length, domains: week.domains.slice(0, 3).map((d) => name.domain(d.domain)).join(", ") } });
  }
  if (week.levelTo > week.levelFrom) lines.push({ key: "levelUp", values: { from: week.levelFrom, to: week.levelTo } });
  for (const r of week.rankUps.slice(0, 2)) lines.push({ key: "rankUp", values: { skill: name.skill(r.skillId), rank: name.rank(r.rank) } });
  if (week.newSkills.length > 0) {
    lines.push({ key: "newSkills", values: { skills: week.newSkills.map(name.skill).join(", ") } });
  }
  for (const t of week.titles.slice(0, 2)) lines.push({ key: "title", values: { title: name.title(t) } });
  if (prev && prev.entries > 0) {
    const diff = week.minutes - prev.minutes;
    if (Math.abs(diff) >= 60) {
      lines.push({ key: diff > 0 ? "moreThanPrev" : "lessThanPrev", values: { hours: hours(Math.abs(diff)) } });
    } else lines.push({ key: "steady" });
  }
  lines.push({ key: "closing" });
  return lines;
}

function hours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

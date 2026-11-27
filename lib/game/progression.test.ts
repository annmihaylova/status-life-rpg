import { describe, expect, it } from "vitest";
import { ATTRIBUTES } from "./attributes";
import { DEFAULT_EXPERIMENTS } from "./config";
import { addDays } from "./dates";
import { totalXpForLevel } from "./formulas";
import { replay } from "./engine/replay";
import type { EngineDecision, EngineEntry, EngineInput, SkillDef } from "./engine/types";
import {
  CLASSES,
  TITLES,
  chooseClass,
  isWeekStart,
  skillDomain,
  titleMet,
  topAttributes,
  weekStartOf,
  type ProgressCounters,
} from "./progression";

const D0 = "2026-01-05"; // понедельник

const sci: SkillDef = { id: "sci", primaryAttr: "intellect", secondaryAttr: "perception", isWorkShift: false, isRest: false, domain: "science", sleepingTargetLevel: null };
const art: SkillDef = { id: "art", primaryAttr: "creativity", secondaryAttr: "perception", isWorkShift: false, isRest: false, domain: "creative", sleepingTargetLevel: null };
const care: SkillDef = { id: "care", primaryAttr: "empathy", secondaryAttr: "charisma", isWorkShift: false, isRest: false, domain: "care", sleepingTargetLevel: null };
const gym: SkillDef = { id: "gym", primaryAttr: "strength", secondaryAttr: "endurance", isWorkShift: false, isRest: false, domain: "body", sleepingTargetLevel: null };
const code: SkillDef = { id: "code", primaryAttr: "intellect", secondaryAttr: "creativity", isWorkShift: false, isRest: false, domain: "tech", sleepingTargetLevel: null };
const ALL = [sci, art, care, gym, code];

let seq = 0;
function entry(date: string, minutes: number, skillId = "sci"): EngineEntry {
  seq += 1;
  return {
    id: `e${String(seq).padStart(5, "0")}`,
    date,
    orderKey: `${date}T12:${String(Math.floor(seq / 60) % 60).padStart(2, "0")}:${String(seq % 60).padStart(2, "0")}`,
    focusMinutes: minutes,
    intensity: 1,
    novelty: 1,
    isRest: false,
    allocations: [{ skillId, cluster: null, share: 1 }],
    attributeTags: null,
  };
}

function decision<K extends EngineDecision["kind"]>(
  kind: K,
  date: string,
  payload: Extract<EngineDecision, { kind: K }>["payload"],
): EngineDecision {
  seq += 1;
  return { id: `d${seq}`, kind, date, at: `${date}T08:00:00Z`, payload } as EngineDecision;
}

const takeAll = ALL.map((s) => decision("take_skill", D0, { skillId: s.id, slot: "main" }));

function run(p: Partial<EngineInput>) {
  return replay({
    registeredOn: D0,
    today: D0,
    experiments: DEFAULT_EXPERIMENTS,
    skills: ALL,
    entries: [],
    decisions: takeAll,
    wellbeing: {},
    requestedClusters: [],
    ...p,
  });
}

const counters = (over: Partial<ProgressCounters> = {}): ProgressCounters => ({
  date: D0,
  entriesTotal: 0,
  minutesTotal: 0,
  activeDaysTotal: 0,
  domainEntries: {},
  domainMinutes: {},
  domainsToday: 0,
  returnBreakToday: null,
  newSkillDates: [],
  characterLevel: 1,
  maxSkillLevel: 1,
  maxSkillMinutes: 0,
  maxAttributeValue: 10,
  restDays: 0,
  anyUnfolded: false,
  anySpecialization: false,
  anyAwakened: false,
  ...over,
});

describe("конфиги титулов и классов", () => {
  it("ключи уникальны, у каждого есть ru/en", () => {
    expect(new Set(TITLES.map((t) => t.key)).size).toBe(TITLES.length);
    expect(new Set(CLASSES.map((c) => c.key)).size).toBe(CLASSES.length);
    for (const t of TITLES) expect(t.ru && t.en && t.desc_ru && t.desc_en).toBeTruthy();
    for (const c of CLASSES) expect(c.ru && c.en).toBeTruthy();
  });

  it("классов 30–40, характеристики классов — существующие части", () => {
    expect(CLASSES.length).toBeGreaterThanOrEqual(30);
    expect(CLASSES.length).toBeLessThanOrEqual(40);
    const parts = new Set(ATTRIBUTES.filter((a) => a.parent).map((a) => a.key));
    for (const c of CLASSES) {
      expect(c.attrs).toHaveLength(2);
      for (const a of c.attrs) expect(parts.has(a), `${c.key}: ${a}`).toBe(true);
    }
  });

  it("у каждой части характеристики есть хотя бы два класса", () => {
    for (const a of ATTRIBUTES.filter((x) => x.parent)) {
      expect(CLASSES.filter((c) => c.attrs.includes(a.key as never)).length, a.key).toBeGreaterThanOrEqual(2);
    }
  });

  it("нет титулов за серии подряд и ночную работу (PLAN 2г)", () => {
    const types = new Set(TITLES.map((t) => t.rule.type));
    for (const t of types) expect(t).not.toMatch(/streak|consecutive|night|late/);  });
});

describe("правила титулов", () => {
  it("каждое правило срабатывает на своём пороге", () => {
    expect(titleMet({ type: "hours_total", n: 100 }, counters({ minutesTotal: 5999 }))).toBe(false);
    expect(titleMet({ type: "hours_total", n: 100 }, counters({ minutesTotal: 6000 }))).toBe(true);
    expect(titleMet({ type: "domain_entries", domain: "science", n: 2 }, counters({ domainEntries: { science: 2 } }))).toBe(true);
    expect(titleMet({ type: "return_after_break", days: 7 }, counters({ returnBreakToday: 6 }))).toBe(false);
    expect(titleMet({ type: "return_after_break", days: 7 }, counters({ returnBreakToday: 7 }))).toBe(true);
  });

  it("новые навыки считаются в скользящем окне", () => {
    const rule = { type: "new_skills_window", n: 3, days: 30 } as const;
    const dates = ["2026-01-01", "2026-01-20", "2026-02-05"];
    expect(titleMet(rule, counters({ date: "2026-02-05", newSkillDates: dates }))).toBe(false);
    expect(titleMet(rule, counters({ date: "2026-01-30", newSkillDates: dates.slice(0, 2).concat("2026-01-30") }))).toBe(true);
  });
});

describe("движок: титулы", () => {
  it("«Первая кровь» за первую подтверждённую запись — с датой и системным событием", () => {
    const r = run({ entries: [entry(D0, 30)] });
    expect(r.titles).toContainEqual({ key: "first_blood", earnedOn: D0 });
    expect(r.events.some((e) => e.type === "title_earned" && e.title === "first_blood")).toBe(true);
  });

  it("без записей титулов нет", () => {
    expect(run({}).titles).toEqual([]);
  });

  it("«Возвращение» — после перерыва ≥ 7 дней, а не 6", () => {
    const six = run({ today: addDays(D0, 7), entries: [entry(D0, 30), entry(addDays(D0, 7), 30)] });
    expect(six.titles.map((t) => t.key)).not.toContain("comeback");
    const seven = run({ today: addDays(D0, 8), entries: [entry(D0, 30), entry(addDays(D0, 8), 30)] });
    expect(seven.titles).toContainEqual({ key: "comeback", earnedOn: addDays(D0, 8) });
  });

  it("«Многостаночник» — 5 областей за день", () => {
    const four = run({ entries: ["sci", "art", "care", "gym"].map((s) => entry(D0, 20, s)) });
    expect(four.titles.map((t) => t.key)).not.toContain("jack_of_all_trades");
    const five = run({ entries: ["sci", "art", "care", "gym", "code"].map((s) => entry(D0, 20, s)) });
    expect(five.titles.map((t) => t.key)).toContain("jack_of_all_trades");
  });

  it("«Пожиратель статей» — 25 записей в науке; 30 дней с записями — не подряд", () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(addDays(D0, i * 2), 30));
    const r = run({ today: addDays(D0, 60), entries });
    const keys = r.titles.map((t) => t.key);
    expect(keys).toContain("paper_devourer");
    expect(keys).toContain("thirty_days");
    expect(r.titles.find((t) => t.key === "thirty_days")?.earnedOn).toBe(addDays(D0, 58));
  });

  it("порядок строк во входе не меняет титулы", () => {
    const entries = ["sci", "art", "care", "gym", "code"].map((s) => entry(D0, 20, s));
    const a = run({ entries }).titles;
    const b = run({ entries: [...entries].reverse() }).titles;
    expect(b).toEqual(a);
  });
});

describe("классы", () => {
  it("топ-характеристики: видимые сейчас, при равенстве — больше опыта", () => {
    expect(
      topAttributes([
        { key: "mind", value: 12, xpTotal: 0, state: "general" },
        { key: "body", value: 10, xpTotal: 50, state: "general" },
        { key: "spirit", value: 10, xpTotal: 80, state: "general" },
      ]),
    ).toEqual(["mind", "spirit"]);
    expect(
      topAttributes([
        { key: "mind", value: 30, xpTotal: 0, state: "unfolded" },
        { key: "intellect", value: 20, xpTotal: 0, state: "part" },
        { key: "body", value: 11, xpTotal: 0, state: "general" },
      ]),
    ).toEqual(["intellect", "body"]);
  });

  it("одни и те же характеристики, разные области → разные классы", () => {
    expect(chooseClass(["intellect", "will"], ["humanities"])?.key).toBe("scholar");
    expect(chooseClass(["intellect", "will"], ["tech"])?.key).toBe("analyst");
    expect(chooseClass(["intellect", "perception"], ["science"])?.key).toBe("researcher");
    expect(chooseClass(["strength", "endurance"], ["body"])?.key).toBe("titan");
    expect(chooseClass(["empathy", "charisma"], ["care"])?.key).toBe("soul_healer");
  });

  it("до раскрытия класс определяется по общим характеристикам", () => {
    const c = chooseClass(["mind", "spirit"], ["science"]);
    expect(c).not.toBeNull();
    expect(c!.attrs.some((a) => ["intellect", "perception", "will"].includes(a))).toBe(true);
  });

  it("неделя начинается в понедельник", () => {
    expect(isWeekStart("2026-01-05")).toBe(true);
    expect(isWeekStart("2026-01-06")).toBe(false);
    expect(weekStartOf("2026-01-11")).toBe("2026-01-05");
    expect(weekStartOf("2026-01-05")).toBe("2026-01-05");
  });

  it("область навыка без поля domain — по основной характеристике", () => {
    expect(skillDomain(null, "empathy")).toBe("care");
    expect(skillDomain("science", "empathy")).toBe("science");
    expect(skillDomain(null, null)).toBeNull();
  });

  it("движок: класс не определён до 10 уровня, открывается событием на 10-м", () => {
    const xp10 = totalXpForLevel(10);
    const minutesPerDay = 600;
    const days = Math.ceil(xp10 / minutesPerDay) + 1;
    const entries = Array.from({ length: days }, (_, i) => entry(addDays(D0, i), minutesPerDay));
    const before = run({ today: addDays(D0, 2), entries: entries.slice(0, 2) });
    expect(before.characterClass).toBeNull();
    const r = run({ today: addDays(D0, days), entries });
    expect(r.character.level).toBeGreaterThanOrEqual(10);
    expect(r.characterClass?.key).toBeTruthy();
    const unlocked = r.events.filter((e) => e.type === "class_unlocked");
    expect(unlocked).toHaveLength(1);
  });
});

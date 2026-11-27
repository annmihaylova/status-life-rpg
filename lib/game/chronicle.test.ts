import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";
import { allTimeCounters, compareWithPast, heatLevel, heatmap, periodSummary, templateLetter } from "./chronicle";
import { DEFAULT_EXPERIMENTS } from "./config";
import { addDays } from "./dates";
import { replay } from "./engine/replay";
import type { EngineDecision, EngineEntry, EngineInput, SkillDef } from "./engine/types";

const D0 = "2026-01-05"; // понедельник
const sci: SkillDef = { id: "sci", primaryAttr: "intellect", secondaryAttr: "perception", isWorkShift: false, isRest: false, domain: "science", sleepingTargetLevel: null };
const gym: SkillDef = { id: "gym", primaryAttr: "strength", secondaryAttr: "endurance", isWorkShift: false, isRest: false, domain: "body", sleepingTargetLevel: null };

let seq = 0;
const entry = (date: string, minutes: number, allocations: EngineEntry["allocations"] = [{ skillId: "sci", cluster: null, share: 1 }]): EngineEntry => {
  seq += 1;
  return { id: `e${String(seq).padStart(4, "0")}`, date, orderKey: `${date}T10:00:${String(seq % 60).padStart(2, "0")}`, focusMinutes: minutes, intensity: 1, novelty: 1, isRest: false, allocations, attributeTags: null };
};
const decision = (kind: EngineDecision["kind"], date: string, payload: unknown): EngineDecision =>
  ({ id: `d${++seq}`, kind, date, at: `${date}T08:00:00Z`, payload }) as EngineDecision;

function setup(entries: EngineEntry[], today = addDays(D0, 13), extra: EngineDecision[] = []) {
  const input: EngineInput = {
    registeredOn: D0,
    today,
    experiments: DEFAULT_EXPERIMENTS,
    skills: [sci, gym],
    entries,
    decisions: [
      decision("take_skill", D0, { skillId: "sci", slot: "main" }),
      decision("take_skill", D0, { skillId: "gym", slot: "secondary" }),
      ...extra,
    ],
    wellbeing: {},
    requestedClusters: [],
  };
  return { input, result: replay(input) };
}

describe("итоги периода", () => {
  it("часы, дни, области и навыки за неделю; записи вне недели не считаются", () => {
    const { input, result } = setup([
      entry(D0, 120),
      entry(addDays(D0, 1), 60, [
        { skillId: "sci", cluster: null, share: 0.5 },
        { skillId: "gym", cluster: null, share: 0.5 },
      ]),
      entry(addDays(D0, 8), 90),
    ]);
    const w = periodSummary(input, result, D0, addDays(D0, 6));
    expect(w).toMatchObject({ minutes: 180, entries: 2, activeDays: 2 });
    expect(w.domains).toEqual([
      { domain: "science", minutes: 150 },
      { domain: "body", minutes: 30 },
    ]);
    expect(w.skills[0]).toEqual({ skillId: "sci", minutes: 150 });
    expect(w.xp).toBeCloseTo(180);
    expect(w.titles).toContain("first_blood");
  });

  it("навык из кластера, взятый в периоде, — новый навык", () => {
    const { input, result } = setup(
      [entry(D0, 60, [{ skillId: null, cluster: "chess", share: 1 }])],
      addDays(D0, 6),
      [decision("take_skill", addDays(D0, 2), { skillId: "gym", slot: "secondary", clusterKey: "chess" })],
    );
    expect(periodSummary(input, result, D0, addDays(D0, 6)).newSkills).toContain("gym");
  });

  it("счётчики за всё время", () => {
    const { input, result } = setup([entry(D0, 60), entry(addDays(D0, 3), 30, [{ skillId: "gym", cluster: null, share: 1 }])]);
    const c = allTimeCounters(input, result);
    expect(c).toMatchObject({ minutes: 90, entries: 2, activeDays: 2 });
    expect(c.skills.map((s) => s.skillId)).toEqual(["sci", "gym"]);
  });
});

describe("heatmap", () => {
  it("начинается с понедельника, пустые дни нейтральны (уровень 0)", () => {
    const { input } = setup([entry(addDays(D0, 2), 200)], addDays(D0, 9));
    const h = heatmap(input, 2);
    expect(h.start).toBe(D0);
    expect(h.days).toHaveLength(10);
    expect(h.days.find((d) => d.date === addDays(D0, 2))?.minutes).toBe(200);
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(30)).toBe(1);
    expect(heatLevel(200)).toBe(3);
    expect(heatLevel(600)).toBe(4);
  });
});

describe("ты месяц назад и сейчас", () => {
  it("прошлое — тот же движок по данным до той даты", () => {
    const entries = Array.from({ length: 40 }, (_, i) => entry(addDays(D0, i), 120));
    const { input, result } = setup(entries, addDays(D0, 39));
    const c = compareWithPast(input, result, 30);
    expect(c.days).toBe(30);
    expect(c.past.totalXp).toBeCloseTo(120 * 10);
    expect(c.now.totalXp).toBeCloseTo(120 * 40);
    expect(c.now.level).toBeGreaterThanOrEqual(c.past.level);
  });

  it("если с нами меньше месяца — сравнение с днём регистрации", () => {
    const { input, result } = setup([entry(D0, 60)], addDays(D0, 5));
    const c = compareWithPast(input, result, 30);
    expect(c.past.date).toBe(D0);
    expect(c.days).toBe(5);
  });
});

describe("письмо Системы по шаблону", () => {
  const name = { skill: (id: string) => id, domain: (d: string) => d, title: (k: string) => k, rank: (r: string) => r };

  it("тихая неделя — без упрёков; активная — конкретные цифры", () => {
    const { input, result } = setup([entry(D0, 120)], addDays(D0, 13));
    const quiet = templateLetter(periodSummary(input, result, addDays(D0, 7), addDays(D0, 13)), periodSummary(input, result, D0, addDays(D0, 6)), name);
    expect(quiet.map((l) => l.key)).toEqual(["quiet", "quietPrev", "quietEnd"]);
    const busy = templateLetter(periodSummary(input, result, D0, addDays(D0, 6)), null, name);
    expect(busy[0]).toEqual({ key: "opening", values: { hours: 2, days: 1, entries: 1 } });
    expect(busy.at(-1)?.key).toBe("closing");
  });

  it("у каждой строки письма есть перевод ru и en", () => {
    const keys = ["quiet", "quietPrev", "quietEnd", "opening", "topSkill", "breadth", "levelUp", "rankUp", "newSkills", "title", "moreThanPrev", "lessThanPrev", "steady", "closing"];
    for (const dict of [ru, en]) {
      const letter = (dict as unknown as { chronicle: { letter: Record<string, string> } }).chronicle.letter;
      for (const k of keys) expect(letter[k], k).toBeTruthy();
    }
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_EXPERIMENTS } from "./config";
import { computeHp, hpMax, isRestDay, morningFraction, secondWindBonus } from "./hp";

const base = {
  enduranceValue: 10,
  characterLevel: 1,
  entries: [],
  checkin: null,
  yesterdayWasRestDay: false,
  secondWindActive: false,
};

describe("HP (SPEC 2.6)", () => {
  it("максимум: 100 + 10 × (Вын − 10) + 2 × (ур − 1)", () => {
    expect(hpMax(10, 1)).toBe(100);
    expect(hpMax(12, 11)).toBe(140);
    expect(hpMax(10, 1, true)).toBe(70);
  });

  it.each([
    [8, 1],
    [9, 1],
    [6.5, 0.8],
    [5, 0.6],
    [3, 0.45],
    [null, 0.9],
  ])("сон %s ч → %f", (h, f) => {
    expect(morningFraction(h)).toBe(f);
  });

  it("без данных — 90%", () => {
    expect(computeHp(base).current).toBe(90);
  });

  it("тяжёлая нагрузка и перегруз", () => {
    const r = computeHp({
      ...base,
      checkin: { sleepHours: 8, sick: false },
      entries: [{ focusMinutes: 660, intensity: 1.3, isRest: false }],
    });
    // 100% − 11 × 4% − 10% = 46%
    expect(r.current).toBe(46);
    expect(r.effects).toContain("overload");
  });

  it("отдых восстанавливает, максимум +30%", () => {
    const r = computeHp({
      ...base,
      checkin: { sleepHours: 5, sick: false },
      entries: [{ focusMinutes: 600, intensity: 1, isRest: true }],
    });
    expect(r.current).toBe(90); // 60% + 30%
  });

  it("при HP < 30% отдых восстанавливает вдвое", () => {
    const r = computeHp({
      ...base,
      checkin: { sleepHours: 4, sick: false },
      entries: [
        { focusMinutes: 300, intensity: 1.6, isRest: false },
        { focusMinutes: 30, intensity: 1, isRest: true },
      ],
    });
    // 45% − 20% = 25% (< 30%) → +10% вместо +5%
    expect(r.current).toBe(35);
  });

  it("HP не падает ниже пола", () => {
    const r = computeHp({
      ...base,
      checkin: { sleepHours: 3, sick: false },
      entries: [{ focusMinutes: 900, intensity: 1.6, isRest: false }],
    });
    expect(r.current).toBe(5);
    expect(r.suggestRest).toBe(true);
  });

  it("статус-эффекты", () => {
    const r = computeHp({
      ...base,
      checkin: { sleepHours: 5, sick: true },
      yesterdayWasRestDay: true,
      secondWindActive: true,
    });
    expect(r.effects).toEqual(["lack_of_sleep", "unwell", "recovery", "second_wind"]);
    expect(r.max).toBe(70);
  });
});

describe("эксперименты (PLAN 2б)", () => {
  const restEntries = [
    { focusMinutes: 60, intensity: 1, isRest: false },
    { focusMinutes: 90, intensity: 1, isRest: true },
  ];
  it("день отдыха, вариант A", () => {
    expect(isRestDay({ variant: "A", entries: restEntries, manualRestMark: false })).toBe(true);
    expect(
      isRestDay({
        variant: "A",
        entries: [{ focusMinutes: 200, intensity: 1, isRest: false }],
        manualRestMark: false,
      }),
    ).toBe(false);
  });
  it("ручная отметка работает всегда", () => {
    expect(isRestDay({ variant: "B", entries: [], manualRestMark: true })).toBe(true);
    expect(isRestDay({ variant: "B", entries: restEntries, manualRestMark: false })).toBe(false);
  });
  it("вариант C — решение LLM", () => {
    expect(isRestDay({ variant: "C", entries: [], manualRestMark: false, llmSaysRestDay: true })).toBe(
      true,
    );
  });
  it("второе дыхание", () => {
    expect(secondWindBonus(DEFAULT_EXPERIMENTS, 7, 0)).toMatchObject({
      active: true,
      characterXpBonus: 0.1,
    });
    expect(secondWindBonus(DEFAULT_EXPERIMENTS, 7, 1).active).toBe(false);
    expect(secondWindBonus(DEFAULT_EXPERIMENTS, 6, 0).active).toBe(false);
    expect(secondWindBonus({ ...DEFAULT_EXPERIMENTS, secondWind: "B" }, 10, 2)).toMatchObject({
      active: true,
      skillXpBonus: 0.2,
    });
  });
});

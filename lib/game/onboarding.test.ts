import { describe, expect, it } from "vitest";
import { isPartKey } from "./attributes";
import {
  assessCharacter,
  CATEGORIES,
  estimatePastHours,
  GROUPS,
  hoursToPoints,
  PRESET_SKILLS,
  suggestedSkills,
  targetLevelForHours,
} from "./onboarding";

describe("пресеты онбординга", () => {
  it("каждая группа ссылается на существующие навыки", () => {
    for (const g of GROUPS) {
      for (const k of g.skills) expect(PRESET_SKILLS[k], `${g.key}.${k}`).toBeDefined();
    }
    expect(GROUPS.length).toBeGreaterThanOrEqual(60);
  });

  it("каждая группа в известной категории, у каждой категории есть группы", () => {
    const cats = new Set(CATEGORIES.map((c) => c.key));
    for (const g of GROUPS) expect(cats.has(g.category), g.key).toBe(true);
    for (const c of CATEGORIES) expect(GROUPS.some((g) => g.category === c.key), c.key).toBe(true);
  });

  it("есть группы для всех возрастов: школьники и пенсионеры", () => {
    expect(suggestedSkills([], "13-15").length).toBeGreaterThan(0);
    expect(suggestedSkills([], "65+").map((s) => s.key)).toContain("gardening");
    expect(suggestedSkills([], "25-34")).toEqual([]);
  });

  it("у каждого навыка корректные теги и обобщённое имя", () => {
    for (const s of Object.values(PRESET_SKILLS)) {
      expect(isPartKey(s.primary), s.key).toBe(true);
      if (s.secondary) expect(isPartKey(s.secondary), s.key).toBe(true);
      expect(s.ru.length).toBeGreaterThan(2);
      expect(s.scope_ru.length).toBeGreaterThan(5);
    }
  });

  it("стартовые навыки по группам без повторов", () => {
    const s = suggestedSkills(["student_science", "student_tech"]).map((x) => x.key);
    expect(s).toEqual(["biology", "chemistry", "math", "programming", "lab_work", "research", "engineering"]);
  });
});

describe("оценка часов и уровней", () => {
  it("10 лет, 3 раза в неделю по часу ≈ 1560 ч → цель ~82", () => {
    const h = estimatePastHours(10, 3, 1);
    expect(h).toBe(1560);
    expect(targetLevelForHours(h)).toBeGreaterThanOrEqual(82);
  });

  it("очки за часы", () => {
    expect([10, 50, 200, 500, 1500, 5000].map(hoursToPoints)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("стартовая оценка характеристик", () => {
  it("пример из SPEC: катание, программирование, преподавание, студентка-биолог", () => {
    const a = assessCharacter(
      [
        { name: "Фигурное катание", hours: 1560, primary: "dexterity", secondary: "endurance" },
        { name: "Программирование", hours: 700, primary: "intellect", secondary: "will" },
        { name: "Преподавание", hours: 150, primary: "charisma", secondary: "intellect" },
      ],
      ["student_science"],
    );
    expect(a.values.body).toBeGreaterThan(10);
    expect(a.values.mind).toBeGreaterThan(a.values.spirit);
    expect(a.bonuses.body + a.bonuses.mind + a.bonuses.spirit).toBeLessThanOrEqual(10);
    for (const g of ["body", "mind", "spirit"] as const) {
      expect(a.bonuses[g]).toBeLessThanOrEqual(6);
      if (a.bonuses[g] > 0) expect(a.reasons[g].length).toBeGreaterThan(0);
    }
    expect(a.reasons.body[0].label).toContain("Фигурное катание");
  });

  it("без опыта и групп — все по 10", () => {
    const a = assessCharacter([], []);
    expect(a.values).toEqual({ body: 10, mind: 10, spirit: 10 });
  });

  it("огромный опыт упирается в ограничения", () => {
    const a = assessCharacter(
      ["a", "b", "c", "d"].map((n) => ({ name: n, hours: 10000, primary: "intellect" as const, secondary: null })),
      ["researcher", "student_tech", "it"],
    );
    expect(a.bonuses.mind).toBe(6);
  });

  it("группы дают не больше +2 одной характеристике", () => {
    const a = assessCharacter([], ["student_science", "student_tech", "it", "researcher"]);
    expect(a.bonuses.mind).toBe(2);
  });
});

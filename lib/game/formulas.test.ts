import { describe, expect, it } from "vitest";
import {
  addAttributeXp,
  applySleepingMultiplier,
  attributeSkillBonus,
  canOfferUnfold,
  characterLevelFromXp,
  clampAssessmentBonuses,
  daysRequired,
  diminishingFactor,
  entryXp,
  mainSlots,
  normalizeShares,
  secondarySlots,
  skillLevelFromXp,
  skillRank,
  skillTotalXpForLevel,
  skillXp,
  sleepingTargetLevel,
  splitPool,
  starsOf,
  totalXpForLevel,
  unfoldValues,
  validateCalibration,
  xpPerStar,
  xpToNextPoint,
  type AttributeProgress,
} from "./formulas";

describe("уровень персонажа (SPEC 3.2)", () => {
  it.each([
    [2, 100],
    [5, 1232],
    [10, 6424],
    [15, 16303],
    [20, 31296],
    [25, 51718],
    [30, 77824],
    [50, 243047],
    [100, 1129232],
  ])("ур. %i = %i XP накопленно", (level, xp) => {
    expect(totalXpForLevel(level)).toBe(xp);
  });

  it("уровень по XP", () => {
    expect(characterLevelFromXp(0).level).toBe(1);
    expect(characterLevelFromXp(99).level).toBe(1);
    expect(characterLevelFromXp(100).level).toBe(2);
    expect(characterLevelFromXp(31296).level).toBe(20);
    expect(characterLevelFromXp(31295).level).toBe(19);
    const p = characterLevelFromXp(150);
    expect(p).toMatchObject({ level: 2, xpIntoLevel: 50 });
    expect(p.xpToNext).toBe(p.xpForLevel - 50);
  });

  it("ур. 20 ≈ 87 дней по 360 XP", () => {
    expect(Math.round(totalXpForLevel(20) / 360)).toBe(87);
  });
});

describe("уровень навыка (SPEC 3.3)", () => {
  it.each([
    [2, 0.25],
    [5, 2.92],
    [10, 14.68],
    [25, 112.75],
    [50, 511.53],
    [75, 1232.02],
    [100, 2295.13],
  ])("ур. %i ≈ %f ч", (level, hours) => {
    expect(skillTotalXpForLevel(level) / 60).toBeCloseTo(hours, 2);
  });

  it.each([
    [50, 17],
    [200, 32],
    [500, 49],
    [1500, 82],
  ])("спящий навык: %i ч → цель %i", (hours, level) => {
    expect(sleepingTargetLevel(hours)).toBe(level);
  });

  it("ранги", () => {
    expect(skillRank(1)).toBe("novice");
    expect(skillRank(9)).toBe("novice");
    expect(skillRank(10)).toBe("apprentice");
    expect(skillRank(25)).toBe("journeyman");
    expect(skillRank(50)).toBe("specialist");
    expect(skillRank(75)).toBe("expert");
    expect(skillRank(100)).toBe("master");
    expect(skillRank(140)).toBe("master");
  });

  it("уровень навыка по XP", () => {
    expect(skillLevelFromXp(15).level).toBe(2);
    expect(skillLevelFromXp(14).level).toBe(1);
  });
});

describe("XP записи (SPEC 3.1)", () => {
  it("focus × intensity × novelty", () => {
    expect(entryXp(60, 1, 1)).toBe(60);
    expect(entryXp(60, 1.3, 1.2)).toBeCloseTo(93.6);
  });

  it("обрезает диапазоны", () => {
    expect(entryXp(2000, 1, 1)).toBe(960);
    expect(entryXp(60, 5, 1)).toBeCloseTo(96);
    expect(entryXp(60, 1, 1.25)).toBeCloseTo(72); // novelty 1.25 из примера MCP → 1.2
  });

  it("нормализует доли", () => {
    const r = normalizeShares([{ share: 2 }, { share: 2 }, { share: 0 }]);
    expect(r.map((x) => x.share)).toEqual([0.5, 0.5]);
    expect(normalizeShares([{ share: 0 }])).toEqual([]);
  });

  it("убывающая отдача: 180 ×1.0, 120 ×0.7, дальше ×0.4", () => {
    expect(diminishingFactor(0, 180, false)).toBe(1);
    expect(diminishingFactor(180, 120, false)).toBeCloseTo(0.7);
    expect(diminishingFactor(300, 60, false)).toBeCloseTo(0.4);
    // 600 минут подряд: 180 + 84 + 120 = 384
    expect(diminishingFactor(0, 600, false) * 600).toBeCloseTo(384);
    // запись пересекает границу
    expect(diminishingFactor(150, 60, false) * 60).toBeCloseTo(30 + 30 * 0.7);
  });

  it("рабочая смена: 480 ×1.0, дальше ×0.7", () => {
    expect(diminishingFactor(0, 480, true)).toBe(1);
    expect(diminishingFactor(0, 600, true) * 600).toBeCloseTo(480 + 84);
  });

  it("бонус характеристики от 1.0 до 1.3", () => {
    expect(attributeSkillBonus(10)).toBe(1);
    expect(attributeSkillBonus(15)).toBeCloseTo(1.1);
    expect(attributeSkillBonus(40)).toBeCloseTo(1.3);
    expect(attributeSkillBonus(8)).toBe(1);
  });

  it("справедливость: смена грузчика 8 ч ≈ учебный день студента 8 ч (±10%)", () => {
    const loader = entryXp(480, 1.3, 1.0);
    const student = [120, 120, 120, 120].reduce((s, m) => s + entryXp(m, 1.3, 1.0), 0);
    expect(Math.abs(loader - student) / student).toBeLessThanOrEqual(0.1);

    // и на уровне навыка: смена с is_work_shift не режется убывающей отдачей
    const loaderSkill = skillXp({
      entryXp: loader,
      share: 1,
      skillMinutes: 480,
      priorSkillMinutesToday: 0,
      isWorkShift: true,
      primaryAttributeValue: 10,
      sleepingTargetLevel: null,
      currentSkillXp: 0,
    }).amount;
    expect(loaderSkill).toBeCloseTo(loader);
  });
});

describe("спящие навыки ×5", () => {
  it("буст только до цели", () => {
    const target = 17;
    const targetXp = skillTotalXpForLevel(target);
    expect(applySleepingMultiplier(100, 0, target)).toBe(500);
    expect(applySleepingMultiplier(100, targetXp, target)).toBe(100);
    // осталось 50 XP до цели: 10 базовых XP ×5 закрывают цель, остальные 90 — обычные
    expect(applySleepingMultiplier(100, targetXp - 50, target)).toBe(50 + 90);
    expect(applySleepingMultiplier(100, 0, null)).toBe(100);
  });
});

describe("слоты (SPEC 2.3)", () => {
  it("основные: 4 + по одному на 10/25/50/75/100, максимум 9", () => {
    expect(mainSlots(1)).toBe(4);
    expect(mainSlots(10)).toBe(5);
    expect(mainSlots(49)).toBe(6);
    expect(mainSlots(100)).toBe(9);
    expect(mainSlots(200)).toBe(9);
  });
  it("второстепенные: 6 + по одному на каждый 10-й, максимум 16", () => {
    expect(secondarySlots(1)).toBe(6);
    expect(secondarySlots(10)).toBe(7);
    expect(secondarySlots(99)).toBe(15);
    expect(secondarySlots(100)).toBe(16);
    expect(secondarySlots(150)).toBe(16);
  });
});

describe("характеристики (SPEC 3.4)", () => {
  it.each([
    [10, 600, 60, 2],
    [11, 1378, 138, 2],
    [12, 2242, 224, 3],
    [14, 4139, 414, 4],
    [16, 6198, 620, 5],
    [18, 8380, 838, 6],
    [20, 10662, 1066, 7],
    [25, 16715, 1672, 9],
  ])("%i → +1: %i XP, звезда %i, дней %i", (v, xp, star, days) => {
    expect(xpToNextPoint(v)).toBe(xp);
    expect(Math.round(xpPerStar(v))).toBe(star);
    expect(daysRequired(v)).toBe(days);
  });

  it("дней максимум 10 начиная с 26", () => {
    expect(daysRequired(26)).toBe(10);
    expect(daysRequired(40)).toBe(10);
  });

  it("очко не выбить одним марафоном: нужен второй активный день", () => {
    const s0: AttributeProgress = { value: 10, pool: 0, activeDaysSincePoint: 0 };
    const day1 = addAttributeXp(s0, 5000, true);
    expect(day1.state.value).toBe(10);
    expect(starsOf(day1.state)).toBe(10);
    const day2 = addAttributeXp(day1.state, 0, true);
    expect(day2.state.value).toBeGreaterThan(10);
    expect(day2.events.some((e) => e.type === "point")).toBe(true);
  });

  it("звёзды как события", () => {
    const s0: AttributeProgress = { value: 10, pool: 0, activeDaysSincePoint: 0 };
    const r = addAttributeXp(s0, 130, true);
    expect(r.events).toEqual([{ type: "star", value: 10, stars: 2 }]);
    expect(addAttributeXp(r.state, 10, false).events).toEqual([]);
  });

  /** Порт simulate() из scripts/balance.py */
  function simulate(start: number, xpPerDay: number, activeDaysPerWeek: number, days: number) {
    let s: AttributeProgress = { value: start, pool: 0, activeDaysSincePoint: 0 };
    const pointDays: number[] = [];
    for (let d = 1; d <= days; d++) {
      const active = d % 7 < activeDaysPerWeek;
      const r = addAttributeXp(s, active ? (xpPerDay * 7) / activeDaysPerWeek : 0, active);
      s = r.state;
      for (const e of r.events) if (e.type === "point") pointDays.push(d);
    }
    return { value: s.value, pointDays };
  }

  it("профиль студентки к ур. 20 (день 87) совпадает с balance.py", () => {
    expect(simulate(15, 240, 7, 87)).toEqual({ value: 18, pointDays: [22, 48, 78] });
    expect(simulate(13, 80, 5, 87)).toEqual({ value: 14, pointDays: [39] });
    expect(simulate(12, 40, 2, 87)).toEqual({ value: 13, pointDays: [57] });
  });

  it("эталоны набора очков к ур. 20 совпадают с balance.py", () => {
    const expected: Record<number, [number, number, number]> = {
      20: [1, 0, 0],
      40: [2, 1, 0],
      80: [3, 2, 1],
      150: [5, 3, 2],
      240: [6, 5, 3],
    };
    for (const [xpd, gains] of Object.entries(expected)) {
      [10, 12, 15].forEach((start, i) => {
        expect(simulate(start, Number(xpd), 5, 87).value - start).toBe(gains[i]);
      });
    }
  });
});

describe("раскрытие (SPEC 2.4.4)", () => {
  it("Разум 18, доли 55/30/15 → 21 / 18 / 16", () => {
    expect(unfoldValues(18, [0.55, 0.3, 0.15])).toEqual([21, 18, 16]);
  });

  it("не ниже 10 и без долей — поровну", () => {
    expect(unfoldValues(10, [1, 0, 0])).toEqual([10, 10, 10]);
    expect(unfoldValues(16, [0, 0, 0])).toEqual([16, 16, 16]);
  });

  it("остаток прогресса делится по долям", () => {
    expect(splitPool(100, [0.5, 0.3, 0.2])).toEqual([50, 30, 20]);
  });

  it("условия предложения", () => {
    expect(canOfferUnfold({ characterLevel: 20, xpSinceStart: 6000, activeDaysTotal: 30 })).toBe(
      true,
    );
    expect(canOfferUnfold({ characterLevel: 19, xpSinceStart: 9000, activeDaysTotal: 90 })).toBe(
      false,
    );
    expect(canOfferUnfold({ characterLevel: 30, xpSinceStart: 5999, activeDaysTotal: 90 })).toBe(
      false,
    );
    expect(canOfferUnfold({ characterLevel: 30, xpSinceStart: 9000, activeDaysTotal: 29 })).toBe(
      false,
    );
  });
});

describe("оценка и калибровка (SPEC 2.4.1–2.4.2)", () => {
  it("бонусы 0…6, сумма ≤ 10", () => {
    expect(clampAssessmentBonuses([2, 5, 3])).toEqual([2, 5, 3]);
    expect(clampAssessmentBonuses([9, -1, 2])).toEqual([6, 0, 2]);
    expect(clampAssessmentBonuses([6, 6, 6]).reduce((a, b) => a + b, 0)).toBe(10);
  });

  const rules = { pointsTotal: 5, min: 10, max: 18 };
  it("перенос очков с сохранением суммы", () => {
    expect(validateCalibration([12, 15, 13], [12, 13, 15], rules)).toEqual({
      ok: true,
      pointsUsed: 2,
    });
  });
  it("ошибки калибровки", () => {
    expect(validateCalibration([12, 15, 13], [12, 15, 14], rules)).toMatchObject({ ok: false });
    expect(validateCalibration([12, 15, 13], [10, 21, 9], rules)).toMatchObject({ ok: false });
    expect(validateCalibration([16, 16, 16], [10, 18, 20], rules)).toMatchObject({ ok: false });
    expect(validateCalibration([18, 10, 10], [11, 13, 14], rules)).toMatchObject({
      ok: false,
      reason: "too_many_points",
    });
  });
});

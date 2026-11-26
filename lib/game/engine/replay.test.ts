import { describe, expect, it } from "vitest";
import { DEFAULT_EXPERIMENTS } from "../config";
import { addDays } from "../dates";
import { skillTotalXpForLevel, totalXpForLevel, unfoldValues } from "../formulas";
import { replay } from "./replay";
import type { EngineDecision, EngineEntry, EngineInput, SkillDef } from "./types";

const D0 = "2026-01-01";

const study: SkillDef = {
  id: "study",
  primaryAttr: "intellect",
  secondaryAttr: "will",
  isWorkShift: false,
  isRest: false,
  sleepingTargetLevel: null,
};

let seq = 0;
function entry(date: string, minutes: number, alloc: Partial<EngineEntry> = {}): EngineEntry {
  seq += 1;
  return {
    id: `e${String(seq).padStart(4, "0")}`,
    date,
    orderKey: `${date}T12:00:${String(seq % 60).padStart(2, "0")}`,
    focusMinutes: minutes,
    intensity: 1,
    novelty: 1,
    isRest: false,
    allocations: [{ skillId: "study", cluster: null, share: 1 }],
    attributeTags: null,
    ...alloc,
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

function run(p: Partial<EngineInput>) {
  return replay({
    registeredOn: D0,
    today: D0,
    experiments: DEFAULT_EXPERIMENTS,
    skills: [study],
    entries: [],
    decisions: [decision("take_skill", D0, { skillId: "study", slot: "main" })],
    wellbeing: {},
    requestedClusters: [],
    ...p,
  });
}

describe("replay: базовые начисления", () => {
  it("XP персонажа, навыка и характеристик за одну запись", () => {
    const r = run({ entries: [entry(D0, 60)] });
    expect(r.character.totalXp).toBe(60);
    expect(r.skills.study.xp).toBe(60);
    // Разум не раскрыт: Инт (2/3) и Вол (1/3) идут в Разум
    expect(r.attributes.mind?.xpTotal).toBeCloseTo(60);
    expect(r.attributeTagXp.mind?.intellect).toBeCloseTo(40);
    expect(r.attributeTagXp.mind?.will).toBeCloseTo(20);
    expect(r.attributes.mind?.activeDaysTotal).toBe(1);
    expect(r.ledger.filter((l) => l.targetType === "character")).toHaveLength(1);
  });

  it("убывающая отдача за день на навык", () => {
    const r = run({ entries: [entry(D0, 150), entry(D0, 150)] });
    expect(r.character.totalXp).toBe(300); // XP персонажа без убывающей отдачи
    expect(r.skills.study.xp).toBeCloseTo(150 + 30 + 120 * 0.7);
  });

  it("второстепенный слот даёт характеристикам ×0.5", () => {
    const r = run({
      entries: [entry(D0, 60)],
      decisions: [decision("take_skill", D0, { skillId: "study", slot: "secondary" })],
    });
    expect(r.skills.study.xp).toBe(60);
    expect(r.attributes.mind?.xpTotal).toBeCloseTo(30);
  });

  it("активность без навыка: XP персонажа и характеристик по тегам с весом эксперимента", () => {
    const e = entry(D0, 60, {
      allocations: [],
      attributeTags: { primary: "creativity", secondary: null },
    });
    expect(run({ entries: [e] }).attributes.spirit?.xpTotal).toBeCloseTo(30);
    const b = run({
      entries: [e],
      experiments: { ...DEFAULT_EXPERIMENTS, noSkillAttributeWeight: "B" },
    });
    expect(b.attributes.spirit?.xpTotal).toBeCloseTo(60);
    expect(b.character.totalXp).toBe(60);
  });

  it("детерминизм: порядок строк во входе не влияет на результат", () => {
    const entries = [entry(D0, 50), entry(addDays(D0, 1), 200), entry(addDays(D0, 1), 90)];
    const decisions = [
      decision("take_skill", D0, { skillId: "study", slot: "main" }),
      decision("assessment", D0, { bonuses: { mind: 4 } }),
    ];
    const a = run({ entries, decisions, today: addDays(D0, 2) });
    const b = run({
      entries: [...entries].reverse(),
      decisions: [...decisions].reverse(),
      today: addDays(D0, 2),
    });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe("replay: кандидаты и предложения навыков", () => {
  const cl = (date: string, minutes: number, cluster = "chess") =>
    entry(date, minutes, { allocations: [{ skillId: null, cluster, share: 1 }] });

  it("предложение при ≥120 минут за ≥2 дня в окне 14 дней", () => {
    const r = run({ entries: [cl(D0, 70), cl(addDays(D0, 2), 60)], today: addDays(D0, 3) });
    const offer = r.events.find((e) => e.type === "skill_offer");
    expect(offer).toMatchObject({ cluster: "chess", date: addDays(D0, 2) });
    expect(r.candidates.chess).toMatchObject({ offerStatus: "offered", daysSeen: 2, minutesTotal: 130 });
  });

  it("один долгий день — не повод: нужно ≥2 разных дня", () => {
    const r = run({ entries: [cl(D0, 300)], today: addDays(D0, 3) });
    expect(r.events.some((e) => e.type === "skill_offer")).toBe(false);
  });

  it("первые 14 дней — не больше одного предложения в день", () => {
    const entries = ["a", "b", "c"].flatMap((c) => [cl(D0, 70, c), cl(addDays(D0, 1), 70, c)]);
    const r = run({ entries, today: addDays(D0, 3) });
    const offers = r.events.filter((e) => e.type === "skill_offer");
    expect(offers.map((o) => o.date)).toEqual([addDays(D0, 1), addDays(D0, 2), addDays(D0, 3)]);
  });

  it("после разгона — не больше двух предложений в неделю", () => {
    const start = addDays(D0, 20);
    const entries = ["a", "b", "c", "d"].flatMap((c) => [cl(start, 70, c), cl(addDays(start, 1), 70, c)]);
    const r = run({ entries, today: addDays(start, 8) });
    const offers = r.events.filter((e) => e.type === "skill_offer");
    expect(offers.filter((o) => o.date === addDays(start, 1))).toHaveLength(2);
    expect(offers.filter((o) => o.date < addDays(start, 8))).toHaveLength(2);
    expect(offers).toHaveLength(4);
  });

  it("взятый навык получает опыт кандидата задним числом", () => {
    const chess: SkillDef = { ...study, id: "chess-skill", primaryAttr: "intellect", secondaryAttr: "perception" };
    const r = run({
      skills: [study, chess],
      entries: [cl(D0, 70), cl(addDays(D0, 2), 60)],
      decisions: [
        decision("take_skill", D0, { skillId: "study", slot: "main" }),
        decision("take_skill", addDays(D0, 5), { skillId: "chess-skill", slot: "main", clusterKey: "chess" }),
      ],
      today: addDays(D0, 5),
    });
    expect(r.skills["chess-skill"].xp).toBe(130);
    expect(r.skills["chess-skill"]).toMatchObject({ status: "active", takenOn: addDays(D0, 5) });
    expect(r.candidates.chess.offerStatus).toBe("accepted");
    expect(r.ledger.some((l) => l.targetType === "candidate")).toBe(false);
  });

  it("«Не предлагать» — больше не предлагается; «Позже» — снова через 7 дней", () => {
    const entries = [cl(D0, 70), cl(addDays(D0, 1), 70), cl(addDays(D0, 9), 70), cl(addDays(D0, 10), 70)];
    const declined = run({
      entries,
      decisions: [decision("decline_skill", addDays(D0, 2), { clusterKey: "chess" })],
      today: addDays(D0, 12),
    });
    expect(declined.events.filter((e) => e.type === "skill_offer")).toHaveLength(1);
    const snoozed = run({
      entries,
      decisions: [decision("snooze_skill", addDays(D0, 2), { clusterKey: "chess" })],
      today: addDays(D0, 12),
    });
    expect(snoozed.events.filter((e) => e.type === "skill_offer").map((e) => e.date)).toEqual([
      addDays(D0, 1),
      addDays(D0, 9),
    ]);
  });

  it("навык по просьбе предлагается при первой активности", () => {
    const r = run({ entries: [cl(D0, 20)], requestedClusters: ["chess"] });
    expect(r.events.some((e) => e.type === "skill_offer")).toBe(true);
  });
});

describe("replay: спящие навыки", () => {
  const skate: SkillDef = {
    id: "skate",
    primaryAttr: "dexterity",
    secondaryAttr: "endurance",
    isWorkShift: false,
    isRest: false,
    sleepingTargetLevel: 17,
  };

  it("пробуждение и ×5 до целевого уровня", () => {
    const r = run({
      skills: [study, skate],
      decisions: [decision("add_sleeping_skill", D0, { skillId: "skate" })],
      entries: [entry(addDays(D0, 1), 60, { allocations: [{ skillId: "skate", cluster: null, share: 1 }] })],
      today: addDays(D0, 1),
    });
    expect(r.skills.skate).toMatchObject({ status: "active", awakenedOn: addDays(D0, 1), slot: "secondary" });
    expect(r.skills.skate.xp).toBe(300);
    expect(r.events.some((e) => e.type === "skill_awakened")).toBe(true);
    // характеристики получают XP без ×5
    expect(r.attributes.body?.xpTotal).toBeCloseTo(60 * 0.5);
  });

  it("после цели множитель выключается", () => {
    const target = skillTotalXpForLevel(17);
    const days = Math.ceil(target / (180 * 5)) + 2;
    const entries = Array.from({ length: days }, (_, i) =>
      entry(addDays(D0, i + 1), 180, { allocations: [{ skillId: "skate", cluster: null, share: 1 }] }),
    );
    const r = run({
      skills: [study, skate],
      decisions: [decision("add_sleeping_skill", D0, { skillId: "skate" })],
      entries,
      today: addDays(D0, days),
    });
    // ровно: цель + обычные минуты после неё
    const boostedDays = Math.floor(target / 900);
    const rest = target - boostedDays * 900;
    const expected = boostedDays * 900 + rest + (180 - rest / 5) + (days - boostedDays - 1) * 180;
    expect(r.skills.skate.xp).toBeCloseTo(expected, 6);
  });
});

describe("replay: характеристики", () => {
  it("оценка и калибровка на старте", () => {
    const r = run({
      decisions: [
        decision("take_skill", D0, { skillId: "study", slot: "main" }),
        decision("assessment", D0, { bonuses: { body: 2, mind: 5, spirit: 3 } }),
        decision("calibration_move", addDays(D0, 1), { kind: "start", values: { mind: 13, spirit: 15 } }),
        decision("calibration_move", addDays(D0, 2), { kind: "start", values: { mind: 9, body: 15 } }),
      ],
      today: addDays(D0, 2),
    });
    expect([r.attributes.body?.value, r.attributes.mind?.value, r.attributes.spirit?.value]).toEqual([
      12, 13, 15,
    ]);
    expect(r.rejectedDecisions).toHaveLength(1);
  });

  it("калибровка после 7 дней отклоняется", () => {
    const r = run({
      decisions: [
        decision("assessment", D0, { bonuses: { mind: 4 } }),
        decision("calibration_move", addDays(D0, 7), { kind: "start", values: { mind: 12, body: 12 } }),
      ],
      today: addDays(D0, 7),
    });
    expect(r.attributes.mind?.value).toBe(14);
    expect(r.rejectedDecisions[0].reason).toBe("calibration_closed");
  });

  it("очко характеристики требует XP и второго активного дня", () => {
    // Разум 10 → 11: 600 XP и 2 активных дня. 400 минут в день дают Разуму 180 + 84 + 40 = 304
    const one = run({ entries: [entry(D0, 400)] });
    expect(one.attributes.mind?.xpTotal).toBeCloseTo(304);
    expect(one.events.some((e) => e.type === "attribute_point")).toBe(false);
    const r = run({ entries: [entry(D0, 400), entry(addDays(D0, 1), 400)], today: addDays(D0, 1) });
    const point = r.events.find((e) => e.type === "attribute_point");
    expect(point).toMatchObject({ attribute: "mind", from: 10, to: 11, date: addDays(D0, 1) });
    expect(r.events.some((e) => e.type === "attribute_star" && e.date === D0)).toBe(true);
  });

  it("раскрытие: предложение и значения частей по скрытым пометкам", () => {
    // 6 часов учёбы каждый день: к ур. 20 (~87 дней) Разум накопит > 6000 XP и > 30 дней
    const days = 95;
    const entries = Array.from({ length: days }, (_, i) => entry(addDays(D0, i), 360));
    const offered = run({ entries, today: addDays(D0, days - 1) });
    const ev = offered.events.find((e) => e.type === "unfold_available" && e.general === "mind");
    expect(ev).toBeDefined();
    expect(offered.character.totalXp).toBeGreaterThanOrEqual(totalXpForLevel(20));

    const unfoldDate = addDays(D0, days);
    const r = run({
      entries,
      decisions: [
        decision("take_skill", D0, { skillId: "study", slot: "main" }),
        decision("unfold", unfoldDate, { general: "mind" }),
      ],
      today: unfoldDate,
    });
    const mindBefore = offered.attributes.mind!.value;
    const [int, per, wil] = unfoldValues(mindBefore, [2 / 3, 0, 1 / 3]);
    expect(r.attributes.intellect?.value).toBe(int);
    expect(r.attributes.perception?.value).toBe(per);
    expect(r.attributes.will?.value).toBe(wil);
    expect(r.attributes.mind?.state).toBe("unfolded");
    expect(r.events.some((e) => e.type === "unfolded")).toBe(true);
  });

  it("раскрытие до выполнения условий отклоняется", () => {
    const r = run({
      decisions: [decision("unfold", D0, { general: "mind" })],
    });
    expect(r.rejectedDecisions[0].reason).toBe("unfold_conditions_not_met");
  });
});

describe("replay: уровни, специализации, HP и баффы", () => {
  it("повышение уровня персонажа и открытие слотов", () => {
    const entries = Array.from({ length: 20 }, (_, i) => entry(addDays(D0, i), 360));
    const r = run({ entries, today: addDays(D0, 19) });
    expect(r.events.some((e) => e.type === "level_up" && e.to === 10)).toBe(true);
    expect(r.events.filter((e) => e.type === "slot_unlocked").map((e) => e.slot)).toEqual(["main", "secondary"]);
  });

  it("специализация на 10 уровне навыка и бонус +10%", () => {
    const toTen = skillTotalXpForLevel(10);
    const entries = Array.from({ length: Math.ceil(toTen / 180) }, (_, i) => entry(addDays(D0, i), 180));
    const after = addDays(D0, entries.length);
    const r = run({
      entries: [
        ...entries,
        entry(after, 60, { allocations: [{ skillId: "study", cluster: null, share: 1, matchesSpecialization: true }] }),
      ],
      decisions: [
        decision("take_skill", D0, { skillId: "study", slot: "main" }),
        decision("choose_specialization", after, { skillId: "study", milestone: 10, name: "Молекулярная биология" }),
      ],
      today: after,
    });
    expect(r.events.some((e) => e.type === "specialization_available" && e.milestone === 10)).toBe(true);
    expect(r.skills.study.specializations).toEqual([{ milestone: 10, name: "Молекулярная биология" }]);
    const last = r.ledger.filter((l) => l.targetType === "skill").at(-1)!;
    expect(last.multipliers.extraBonus).toBeCloseTo(1.1);
  });

  it("HP по сну, перегрузу и восстановлению", () => {
    const r = run({
      entries: [entry(D0, 660, { intensity: 1.3 })],
      wellbeing: { [D0]: { sleepHours: 8, mood1to5: 3, sick: false, manualRest: false, llmRestDay: null } },
    });
    // 100% − 11 × 4% − 10% = 46% от максимума (максимум вырос с уровнем)
    const hp = r.hpDays[D0];
    expect(hp.max).toBe(100 + 2 * (r.character.level - 1));
    expect(hp.current).toBe(Math.round(hp.max * 0.46));
    expect(r.hpDays[D0].effects).toContain("overload");
  });

  it("день отдыха → «Восстановление» и +10% XP на следующий день", () => {
    const d1 = addDays(D0, 1);
    const r = run({
      entries: [entry(d1, 100)],
      wellbeing: { [D0]: { sleepHours: null, mood1to5: null, sick: false, manualRest: true, llmRestDay: null } },
      today: d1,
    });
    expect(r.hpDays[D0].restDay).toBe(true);
    expect(r.hpDays[d1].effects).toContain("recovery");
    expect(r.character.totalXp).toBeCloseTo(110);
  });

  it("«Второе дыхание» после перерыва ≥ 7 дней (вариант A)", () => {
    const back = addDays(D0, 9);
    const r = run({ entries: [entry(D0, 60), entry(back, 100)], today: back });
    expect(r.character.totalXp).toBeCloseTo(60 + 110);
    expect(r.hpDays[back].effects).toContain("second_wind");
  });
});

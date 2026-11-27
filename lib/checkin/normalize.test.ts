import { describe, expect, it } from "vitest";
import { clusterKeyOf, normalizeCheckin } from "./normalize";
import type { LlmCheckin } from "./schema";

const refs = {
  skills: new Map([
    ["s1", "uuid-bio"],
    ["s2", "uuid-math"],
  ]),
  entries: new Map([["e1", "uuid-entry-protein"]]),
};

function base(entries: LlmCheckin["entries"], extra: Partial<LlmCheckin> = {}): LlmCheckin {
  return {
    entries,
    new_clusters: [],
    wellbeing: { sleep_hours: null, mood_1_5: null, sick: null, rest_day: null },
    clarifying_questions: [],
    ...extra,
  };
}

const entry = (over: Partial<LlmCheckin["entries"][number]> = {}): LlmCheckin["entries"][number] => ({
  description: "Лекция по биологии",
  focus_minutes: 120,
  intensity: 1,
  novelty: 1,
  skills: [{ skill_ref: "s1", cluster: null, share: 1 }],
  attribute_tags: null,
  is_rest: false,
  merge_with: null,
  confidence: 0.9,
  quote: "два часа слушала лекцию по биологии",
  ...over,
});

describe("нормализация ответа LLM", () => {
  it("ссылки на навыки превращаются в id", () => {
    const r = normalizeCheckin(base([entry()]), refs);
    expect(r.entries[0].allocations).toEqual([{ skillId: "uuid-bio", cluster: null, share: 1 }]);
  });

  it("доли нормализуются к сумме 1", () => {
    const r = normalizeCheckin(
      base([
        entry({
          skills: [
            { skill_ref: "s1", cluster: null, share: 3 },
            { skill_ref: "s2", cluster: null, share: 1 },
          ],
        }),
      ]),
      refs,
    );
    expect(r.entries[0].allocations.map((a) => a.share)).toEqual([0.75, 0.25]);
  });

  it("неизвестная ссылка без кластера отбрасывается; кластер получает ключ", () => {
    const r = normalizeCheckin(
      base([
        entry({
          skills: [
            { skill_ref: "s99", cluster: null, share: 0.5 },
            { skill_ref: null, cluster: "Структурная биоинформатика", share: 0.5 },
          ],
        }),
      ]),
      refs,
    );
    expect(r.entries[0].allocations).toEqual([
      { skillId: null, cluster: "структурная-биоинформатика", share: 1 },
    ]);
  });

  it("диапазоны: минуты 1…960, интенсивность 0.5…1.6, новизна 0.9…1.2", () => {
    const r = normalizeCheckin(base([entry({ focus_minutes: 2000, intensity: 3, novelty: 1.25 })]), refs);
    expect(r.entries[0]).toMatchObject({ focusMinutes: 960, intensity: 1.6, novelty: 1.2 });
  });

  it("не больше трёх навыков, повторы складываются", () => {
    const r = normalizeCheckin(
      base([
        entry({
          skills: [
            { skill_ref: "s1", cluster: null, share: 0.2 },
            { skill_ref: "s1", cluster: null, share: 0.2 },
            { skill_ref: "s2", cluster: null, share: 0.3 },
            { skill_ref: null, cluster: "a", share: 0.1 },
            { skill_ref: null, cluster: "b", share: 0.05 },
          ],
        }),
      ]),
      refs,
    );
    const a = r.entries[0].allocations;
    expect(a).toHaveLength(3);
    expect(a[0].skillId).toBe("uuid-bio");
    expect(a.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
  });

  it("merge_with — только на записи этого дня", () => {
    const r = normalizeCheckin(base([entry({ merge_with: "e1" }), entry({ merge_with: "e7" })]), refs);
    expect(r.entries.map((e) => e.mergeWith)).toEqual(["uuid-entry-protein", null]);
  });

  it("пустые записи и нулевые минуты пропускаются", () => {
    const r = normalizeCheckin(base([entry({ description: "  " }), entry({ focus_minutes: 0 })]), refs);
    expect(r.entries).toHaveLength(0);
  });

  it("самочувствие: невозможные значения → null; вопросов не больше трёх", () => {
    const r = normalizeCheckin(
      base([], {
        wellbeing: { sleep_hours: 30, mood_1_5: 9, sick: false, rest_day: null },
        clarifying_questions: ["a", "b", "c", "d"],
      }),
      refs,
    );
    expect(r.wellbeing).toEqual({ sleepHours: null, mood: null, sick: false, restDay: null });
    expect(r.questions).toHaveLength(3);
  });

  it("новые кластеры: ключ, теги без повтора", () => {
    const r = normalizeCheckin(
      base([], {
        new_clusters: [
          {
            cluster: "Чтение для удовольствия",
            suggested_skill_name: "Чтение для души",
            scope: "художественные книги",
            attribute_tags: { primary: "creativity", secondary: "creativity" },
            is_work_shift: false,
            is_rest: true,
          },
        ],
      }),
      refs,
    );
    expect(r.clusters[0]).toMatchObject({ cluster: "чтение-для-удовольствия", secondary: null, isRest: true });
  });

  it("ключ кластера стабилен", () => {
    expect(clusterKeyOf("  Шахматы!! ")).toBe("шахматы");
  });
});

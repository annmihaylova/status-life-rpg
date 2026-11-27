import { describe, expect, it } from "vitest";
import { matchSkill, parseIngestBody, planIngest, workoutName } from "./ingest";

const ctx = {
  today: "2026-11-26",
  locale: "ru" as const,
  skills: [
    { id: "s-run", name: "Бег" },
    { id: "s-skate", name: "Фигурное катание" },
  ],
};

describe("разбор тела запроса", () => {
  it("один объект, массив и { items }; числа строками из «Команд» тоже принимаются", () => {
    expect(parseIngestBody({ type: "sleep", hours: "7,5" }).items).toEqual([{ type: "sleep", hours: 7.5 }]);
    expect(parseIngestBody([{ type: "walking", steps: 8000 }]).items).toHaveLength(1);
    expect(parseIngestBody({ items: [{ type: "sleep", hours: 7 }, { type: "nope" }] })).toMatchObject({ errors: 1 });
  });
});

describe("сон", () => {
  it("часы, минуты или секунды → часы с шагом 15 минут, по умолчанию за сегодня", () => {
    const p = planIngest(parseIngestBody([{ type: "sleep", seconds: 26100 }, { type: "sleep", date: "2026-11-25", minutes: 400 }]).items, ctx);
    expect(p.sleep).toEqual([
      { date: "2026-11-26", hours: 7.25 },
      { date: "2026-11-25", hours: 6.75 },
    ]);
  });

  it("нулевой, огромный и будущий сон отбрасывается", () => {
    const p = planIngest(parseIngestBody([{ type: "sleep", hours: 0 }, { type: "sleep", hours: 20 }, { type: "sleep", date: "2026-11-27", hours: 7 }]).items, ctx);
    expect(p.sleep).toEqual([]);
    expect(p.skipped).toBe(3);
  });
});

describe("тренировки и ходьба", () => {
  it("тип тренировки переводится и находит навык; неизвестный — кандидат", () => {
    const p = planIngest(
      parseIngestBody([
        { type: "workout", kind: "Running", minutes: 32, started_at: "2026-11-26T07:00:00Z" },
        { type: "workout", kind: "Traditional Strength Training", seconds: 2700 },
      ]).items,
      ctx,
    );
    expect(p.entries[0]).toMatchObject({
      description: "Бег",
      focus_minutes: 32,
      intensity: 1,
      skills: [{ skill_id: "s-run", activity_cluster: null, share: 1 }],
      client_ref: "device:workout:2026-11-26T07:00:00Z",
    });
    expect(p.entries[1]).toMatchObject({
      description: "Силовые тренировки",
      focus_minutes: 45,
      intensity: 1.3,
      skills: [{ skill_id: null, activity_cluster: "Силовые тренировки" }],
    });
  });

  it("ходьба по шагам: ~100 шагов в минуту, меньше 10 минут не пишем, один ключ на день", () => {
    const p = planIngest(parseIngestBody([{ type: "walking", steps: 8000 }, { type: "walking", steps: 500 }]).items, ctx);
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]).toMatchObject({ focus_minutes: 80, intensity: 0.5, client_ref: "device:walking:2026-11-26" });
    expect(p.skipped).toBe(1);
  });

  it("своё занятие из автоматизации", () => {
    const p = planIngest(parseIngestBody({ type: "activity", name: "Anki", minutes: 20, ref: "anki-2026-11-26" }).items, ctx);
    expect(p.entries[0]).toMatchObject({ description: "Anki", focus_minutes: 20, client_ref: "device:activity:anki-2026-11-26" });
  });

  it("сопоставление навыков без учёта регистра и ё", () => {
    expect(matchSkill("фигурное КАТАНИЕ", ctx.skills)).toBe("s-skate");
    expect(matchSkill("Плавание", ctx.skills)).toBeNull();
    expect(workoutName("hiking", "en").name).toBe("Hiking");
    expect(workoutName("Скандинавская ходьба", "ru").name).toBe("Скандинавская ходьба");
  });
});

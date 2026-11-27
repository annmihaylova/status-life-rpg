import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration, parseMeasurement, trend } from "./measurements";

describe("замеры: разбор значений", () => {
  it("CEFR — уровни A1–C2 в любом регистре", () => {
    expect(parseMeasurement("cefr", "b2")).toEqual({ ok: true, value: { num: 3, text: "B2" } });
    expect(parseMeasurement("cefr", "B3").ok).toBe(false);
  });

  it("числовые шкалы проверяют диапазон и целость", () => {
    expect(parseMeasurement("elo", "1450")).toEqual({ ok: true, value: { num: 1450, text: "1450" } });
    expect(parseMeasurement("elo", "1450.5").ok).toBe(false);
    expect(parseMeasurement("vo2max", "44,5")).toEqual({ ok: true, value: { num: 44.5, text: "44.5" } });
    expect(parseMeasurement("cooper", "100").ok).toBe(false);
    expect(parseMeasurement("wpm", "abc").ok).toBe(false);
  });

  it("время — мм:сс и чч:мм:сс", () => {
    expect(parseDuration("24:10")).toBe(1450);
    expect(parseDuration("1:05:30")).toBe(3930);
    expect(parseDuration("5:70")).toBeNull();
    expect(parseMeasurement("time", "24:10")).toEqual({ ok: true, value: { num: 1450, text: "24:10" } });
    expect(formatDuration(3930)).toBe("1:05:30");
  });

  it("оценка — любой короткий текст без сравнения", () => {
    expect(parseMeasurement("grade", "92/100")).toEqual({ ok: true, value: { num: null, text: "92/100" } });
    expect(parseMeasurement("grade", "").ok).toBe(false);
  });
});

describe("замеры: динамика", () => {
  it("больше — лучше, для времени — наоборот; оценки не сравниваются", () => {
    expect(trend("elo", 1400, 1450)).toBe("better");
    expect(trend("elo", 1450, 1400)).toBe("worse");
    expect(trend("time", 1500, 1450)).toBe("better");
    expect(trend("cefr", 3, 3)).toBe("same");
    expect(trend("grade", null, null)).toBeNull();
  });
});

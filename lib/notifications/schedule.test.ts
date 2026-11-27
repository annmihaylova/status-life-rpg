import { describe, expect, it } from "vitest";
import { effectiveMinutes, isTimeZone, parseLocalTime, reminderDue } from "./schedule";

const at = (iso: string) => new Date(iso);

describe("время напоминания", () => {
  it("разбор HH:MM", () => {
    expect(parseLocalTime("21:00")).toBe(1260);
    expect(parseLocalTime("02:30")).toBe(150);
    expect(parseLocalTime("24:00")).toBeNull();
    expect(parseLocalTime("9:00")).toBeNull();
  });

  it("13–17 лет — не позже 22:00, взрослым — как выбрано", () => {
    expect(effectiveMinutes("23:30", "16-17")).toBe(22 * 60);
    expect(effectiveMinutes("20:00", "13-15")).toBe(20 * 60);
    expect(effectiveMinutes("23:30", "25-34")).toBe(23 * 60 + 30);
    expect(effectiveMinutes("23:30", null)).toBe(23 * 60 + 30);
  });

  it("часовой пояс проверяется", () => {
    expect(isTimeZone("America/Toronto")).toBe(true);
    expect(isTimeZone("Mars/Base")).toBe(false);
  });
});

describe("пора ли напомнить", () => {
  const base = { timeZone: "America/Toronto", time: "21:00", ageBand: "25-34", lastSentOn: null };

  it("до выбранного времени — нет, в окне 2 часа после — да, позже — нет", () => {
    // Торонто зимой UTC−5: 21:00 местного = 02:00 UTC следующего дня
    expect(reminderDue({ ...base, now: at("2026-11-27T01:50:00Z") }).due).toBe(false);
    expect(reminderDue({ ...base, now: at("2026-11-27T02:05:00Z") })).toEqual({ due: true, day: "2026-11-26" });
    expect(reminderDue({ ...base, now: at("2026-11-27T03:55:00Z") }).due).toBe(true);
    expect(reminderDue({ ...base, now: at("2026-11-27T04:05:00Z") }).due).toBe(false);
  });

  it("не чаще раза в день", () => {
    expect(reminderDue({ ...base, lastSentOn: "2026-11-26", now: at("2026-11-27T02:20:00Z") }).due).toBe(false);
    expect(reminderDue({ ...base, lastSentOn: "2026-11-25", now: at("2026-11-27T02:20:00Z") }).due).toBe(true);
  });

  it("время после полуночи: окно переходит через полночь, день — вчерашний", () => {
    const late = { ...base, time: "23:30" };
    // 00:15 местного 27-го = 05:15 UTC
    expect(reminderDue({ ...late, now: at("2026-11-27T05:15:00Z") })).toEqual({ due: true, day: "2026-11-26" });
    const night = { ...base, time: "02:00" };
    // 02:10 местного 27-го = 07:10 UTC — это напоминание за 27-е
    expect(reminderDue({ ...night, now: at("2026-11-27T07:10:00Z") })).toEqual({ due: true, day: "2026-11-27" });
  });

  it("подростку в 23:00 уже не напоминаем — сработало в 22:00", () => {
    const teen = { ...base, time: "23:00", ageBand: "16-17" };
    expect(reminderDue({ ...teen, now: at("2026-11-27T03:05:00Z") }).due).toBe(true); // 22:05 местного
    expect(reminderDue({ ...teen, now: at("2026-11-27T04:05:00Z") }).due).toBe(true); // 23:05 — ещё в окне от 22:00
    expect(reminderDue({ ...teen, lastSentOn: "2026-11-26", now: at("2026-11-27T04:05:00Z") }).due).toBe(false);
  });

  it("неверный часовой пояс — UTC, неверное время — не напоминаем", () => {
    expect(reminderDue({ ...base, timeZone: "Nope/Zone", now: at("2026-11-26T21:10:00Z") }).due).toBe(true);
    expect(reminderDue({ ...base, time: "xx", now: at("2026-11-26T21:10:00Z") }).due).toBe(false);
  });
});

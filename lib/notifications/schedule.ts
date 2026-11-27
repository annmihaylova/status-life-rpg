/**
 * Когда напоминать о вечернем отчёте (SPEC 4.2). Чистая функция: планировщик вызывает сервер
 * каждые 15 минут, а здесь решается, пора ли конкретному человеку.
 *
 * - Время своё у каждого: кто-то заканчивает в 20:00, кто-то в 02:00. Окно отправки после
 *   выбранного времени — 2 часа (если планировщик пропустил запуск, напоминание всё равно придёт).
 * - Не чаще раза в «день напоминания»; если отчёт за этот день уже есть — не напоминаем.
 * - 13–17 лет: не позже 22:00 (SPEC 11.2).
 */
import { addDays, localDate, type IsoDate } from "@/lib/game/dates";

export const REMINDER_WINDOW_MINUTES = 120;
export const TEEN_LATEST_MINUTES = 22 * 60;
const TEEN_BANDS = new Set(["13-15", "16-17"]);

export function parseLocalTime(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function localMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Время напоминания с учётом возраста. */
export function effectiveMinutes(time: string, ageBand: string | null): number | null {
  const t = parseLocalTime(time);
  if (t === null) return null;
  return ageBand && TEEN_BANDS.has(ageBand) ? Math.min(t, TEEN_LATEST_MINUTES) : t;
}

export interface ReminderInput {
  now: Date;
  timeZone: string;
  /** "HH:MM" по местному времени */
  time: string;
  ageBand: string | null;
  lastSentOn: IsoDate | null;
}

/**
 * Пора ли напомнить. `day` — день, к которому относится напоминание (при времени 23:30
 * и запуске в 00:15 это ещё вчерашний день).
 */
export function reminderDue(r: ReminderInput): { due: boolean; day: IsoDate } {
  const tz = isTimeZone(r.timeZone) ? r.timeZone : "UTC";
  const today = localDate(r.now, tz);
  const target = effectiveMinutes(r.time, r.ageBand);
  if (target === null) return { due: false, day: today };
  const nowMin = localMinutes(r.now, tz);
  const since = (nowMin - target + 1440) % 1440;
  const day = nowMin >= target ? today : addDays(today, -1);
  const due = since < REMINDER_WINDOW_MINUTES && r.lastSentOn !== day;
  return { due, day };
}

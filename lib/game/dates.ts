/**
 * Календарные даты в виде строк YYYY-MM-DD (локальная дата пользователя).
 * Арифметика — через UTC, чтобы не зависеть от часового пояса машины.
 */
export type IsoDate = string;

const DAY_MS = 86_400_000;

function toUtcMs(d: IsoDate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return fromUtcMs(toUtcMs(d) + n * DAY_MS);
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / DAY_MS);
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a < b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}

/** Локальная дата момента `at` в часовом поясе `timeZone` (IANA). */
export function localDate(at: Date, timeZone: string): IsoDate {
  // en-CA даёт формат YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtcMs(toUtcMs(s)) === s;
}

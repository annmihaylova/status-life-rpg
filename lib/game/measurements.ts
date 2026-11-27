/**
 * Замеры (фаза 3d): второй вид прогресса рядом с опытом. Опыт — за усилия и только растёт;
 * замер — результат теста или измерения по внешней шкале. Он может понизиться и показывается
 * как «последний замер» с датой. На XP и уровни замеры не влияют.
 */

export const SCALE_KEYS = ["cefr", "elo", "wpm", "cpm", "cooper", "vo2max", "time", "grade", "custom"] as const;
export type ScaleKey = (typeof SCALE_KEYS)[number];

export const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

interface NumericScale {
  kind: "number";
  min: number;
  max: number;
  integer?: boolean;
  /** меньше — лучше (время забега) */
  lowerIsBetter?: boolean;
  /** единица задаётся пользователем (свой показатель) */
  customUnit?: boolean;
}
interface OrdinalScale {
  kind: "ordinal";
  levels: readonly string[];
}
interface TextScale {
  kind: "text";
}
interface TimeScale {
  kind: "time";
}
export type ScaleDef = NumericScale | OrdinalScale | TextScale | TimeScale;

export const SCALES: Record<ScaleKey, ScaleDef> = {
  cefr: { kind: "ordinal", levels: CEFR },
  elo: { kind: "number", min: 0, max: 3500, integer: true },
  wpm: { kind: "number", min: 1, max: 300, integer: true },
  cpm: { kind: "number", min: 1, max: 1500, integer: true },
  cooper: { kind: "number", min: 300, max: 6000, integer: true },
  vo2max: { kind: "number", min: 10, max: 95 },
  /** время на дистанции или задаче, «мм:сс» или «чч:мм:сс»; меньше — лучше */
  time: { kind: "time" },
  /** оценка в любом виде: «5», «A», «92/100» — сравнивать не пытаемся */
  grade: { kind: "text" },
  custom: { kind: "number", min: -1e9, max: 1e9, customUnit: true },
};

export interface ParsedMeasurement {
  /** числовое значение для сравнения (для CEFR — индекс уровня, для времени — секунды) */
  num: number | null;
  /** как показать */
  text: string;
}

export function isScaleKey(s: string): s is ScaleKey {
  return (SCALE_KEYS as readonly string[]).includes(s);
}

/** «1:05:30» / «24:10» / «95» → секунды. */
export function parseDuration(raw: string): number | null {
  const parts = raw.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  const sec = nums.reduce((acc, n) => acc * 60 + n, 0);
  return sec > 0 && sec < 7 * 24 * 3600 ? sec : null;
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** Проверка и нормализация значения замера. */
export function parseMeasurement(scale: ScaleKey, raw: string): { ok: true; value: ParsedMeasurement } | { ok: false } {
  const s = raw.trim();
  if (!s || s.length > 40) return { ok: false };
  const def = SCALES[scale];
  switch (def.kind) {
    case "ordinal": {
      const i = def.levels.indexOf(s.toUpperCase());
      return i < 0 ? { ok: false } : { ok: true, value: { num: i, text: def.levels[i] } };
    }
    case "number": {
      const n = Number(s.replace(",", "."));
      if (!Number.isFinite(n) || n < def.min || n > def.max) return { ok: false };
      if (def.integer && !Number.isInteger(n)) return { ok: false };
      return { ok: true, value: { num: n, text: String(n) } };
    }
    case "time": {
      const sec = parseDuration(s);
      return sec === null ? { ok: false } : { ok: true, value: { num: sec, text: formatDuration(sec) } };
    }
    case "text":
      return { ok: true, value: { num: null, text: s } };
  }
}

export type Trend = "better" | "worse" | "same" | null;

/** Сравнение с прошлым замером той же шкалы (и той же единицы для своего показателя). */
export function trend(scale: ScaleKey, prev: number | null, cur: number | null): Trend {
  if (prev === null || cur === null) return null;
  if (prev === cur) return "same";
  const def = SCALES[scale];
  const lower = def.kind === "time" || (def.kind === "number" && def.lowerIsBetter);
  return (cur > prev) !== Boolean(lower) ? "better" : "worse";
}

/**
 * Данные с часов и телефона (фаза 3d): сон, тренировки, ходьба и любые занятия из автоматизаций
 * (например, «Команды» на iPhone). Чистое преобразование входа в записи и самочувствие;
 * запись в БД — app/api/ingest. Повторная отправка не создаёт дублей (client_ref).
 */
import { z } from "zod";
import { isIsoDate, type IsoDate } from "@/lib/game/dates";

const num = z.union([z.number(), z.string().trim().regex(/^-?\d+([.,]\d+)?$/).transform((s) => Number(s.replace(",", ".")))]);
const day = z.string().trim().refine(isIsoDate).optional();
const intensityWord = z.enum(["light", "normal", "hard", "max"]);

const sleepItem = z.object({
  type: z.literal("sleep"),
  date: day,
  hours: num.optional(),
  minutes: num.optional(),
  seconds: num.optional(),
});
const workoutItem = z.object({
  type: z.literal("workout"),
  date: day,
  started_at: z.string().max(40).optional(),
  kind: z.string().trim().min(1).max(60).default("workout"),
  minutes: num.optional(),
  seconds: num.optional(),
  intensity: z.union([intensityWord, num]).optional(),
});
const walkingItem = z.object({
  type: z.literal("walking"),
  date: day,
  minutes: num.optional(),
  steps: num.optional(),
});
const activityItem = z.object({
  type: z.literal("activity"),
  date: day,
  started_at: z.string().max(40).optional(),
  name: z.string().trim().min(1).max(60),
  minutes: num,
  intensity: z.union([intensityWord, num]).optional(),
  ref: z.string().trim().max(60).optional(),
});

export const ingestItem = z.discriminatedUnion("type", [sleepItem, workoutItem, walkingItem, activityItem]);
export type IngestItem = z.infer<typeof ingestItem>;

/** Тело запроса: один объект, массив или `{ items: [...] }`. */
export function parseIngestBody(body: unknown): { items: IngestItem[]; errors: number } {
  const raw: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
      ? (body as { items: unknown[] }).items
      : [body];
  const items: IngestItem[] = [];
  let errors = 0;
  for (const r of raw.slice(0, 50)) {
    const p = ingestItem.safeParse(r);
    if (p.success) items.push(p.data);
    else errors += 1;
  }
  return { items, errors: errors + Math.max(0, raw.length - 50) };
}

/** Тип тренировки Apple Health / Health Connect → понятное название навыка. */
const WORKOUT_NAMES: Record<string, { ru: string; en: string; intensity?: number }> = {
  running: { ru: "Бег", en: "Running" },
  walking: { ru: "Ходьба", en: "Walking", intensity: 0.5 },
  hiking: { ru: "Походы", en: "Hiking" },
  cycling: { ru: "Велосипед", en: "Cycling" },
  swimming: { ru: "Плавание", en: "Swimming" },
  yoga: { ru: "Йога", en: "Yoga" },
  pilates: { ru: "Пилатес", en: "Pilates" },
  dance: { ru: "Танцы", en: "Dance" },
  rowing: { ru: "Гребля", en: "Rowing" },
  elliptical: { ru: "Кардио", en: "Cardio" },
  hiit: { ru: "Интервальные тренировки", en: "Interval training", intensity: 1.3 },
  "high intensity interval training": { ru: "Интервальные тренировки", en: "Interval training", intensity: 1.3 },
  "traditional strength training": { ru: "Силовые тренировки", en: "Strength training", intensity: 1.3 },
  "functional strength training": { ru: "Силовые тренировки", en: "Strength training", intensity: 1.3 },
  "strength training": { ru: "Силовые тренировки", en: "Strength training", intensity: 1.3 },
  climbing: { ru: "Скалолазание", en: "Climbing", intensity: 1.3 },
  tennis: { ru: "Теннис", en: "Tennis" },
  soccer: { ru: "Футбол", en: "Football" },
  basketball: { ru: "Баскетбол", en: "Basketball" },
  skating: { ru: "Катание на коньках", en: "Skating" },
  "figure skating": { ru: "Фигурное катание", en: "Figure skating" },
  workout: { ru: "Тренировка", en: "Workout" },
  other: { ru: "Тренировка", en: "Workout" },
};

export function workoutName(kind: string, locale: "ru" | "en"): { name: string; intensity: number } {
  const k = kind.trim().toLowerCase().replace(/_/g, " ");
  const known = WORKOUT_NAMES[k];
  if (known) return { name: known[locale], intensity: known.intensity ?? 1 };
  // уже по-русски или своё название — как есть, с заглавной
  return { name: kind.trim().charAt(0).toLocaleUpperCase() + kind.trim().slice(1), intensity: 1 };
}

function intensityOf(v: number | z.infer<typeof intensityWord> | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === "number") return Math.min(1.6, Math.max(0.5, v));
  return { light: 0.5, normal: 1, hard: 1.3, max: 1.6 }[v];
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е");

export interface UserSkillRef {
  id: string;
  name: string;
}

/** Навык пользователя с таким же названием (без учёта регистра и ё) или с него начинающийся. */
export function matchSkill(name: string, skills: UserSkillRef[]): string | null {
  const n = normalize(name);
  const exact = skills.find((s) => normalize(s.name) === n);
  if (exact) return exact.id;
  const prefix = skills.find((s) => normalize(s.name).startsWith(n) || n.startsWith(normalize(s.name)));
  return prefix?.id ?? null;
}

/** Запись для logActivities (тот же формат, что у MCP). */
export interface DeviceLogItem {
  date: IsoDate;
  description: string;
  focus_minutes: number;
  intensity: number;
  novelty: number;
  skills: { skill_id: string | null; activity_cluster: string | null; share: number }[];
  confidence: number;
  evidence: string;
  client_ref: string;
}

export interface IngestPlan {
  entries: DeviceLogItem[];
  sleep: { date: IsoDate; hours: number }[];
  skipped: number;
}

/** Шагов в минуту обычной ходьбы — для оценки, если часы прислали только шаги. */
export const STEPS_PER_MINUTE = 100;
export const MIN_WALK_MINUTES = 10;

function minutesOf(i: { minutes?: number; seconds?: number }): number | null {
  const m = i.minutes ?? (i.seconds !== undefined ? i.seconds / 60 : undefined);
  return m !== undefined && Number.isFinite(m) ? m : null;
}

export function planIngest(
  items: IngestItem[],
  ctx: { today: IsoDate; locale: "ru" | "en"; skills: UserSkillRef[] },
): IngestPlan {
  const plan: IngestPlan = { entries: [], sleep: [], skipped: 0 };
  const en = ctx.locale === "en";
  const alloc = (name: string) => {
    const id = matchSkill(name, ctx.skills);
    return [{ skill_id: id, activity_cluster: id ? null : name, share: 1 }];
  };

  for (const it of items) {
    const date = it.date ?? ctx.today;
    if (date > ctx.today) {
      plan.skipped += 1;
      continue;
    }
    switch (it.type) {
      case "sleep": {
        const h = it.hours ?? (it.minutes !== undefined ? it.minutes / 60 : it.seconds !== undefined ? it.seconds / 3600 : null);
        if (h === null || !(h > 0) || h > 16) {
          plan.skipped += 1;
          break;
        }
        plan.sleep.push({ date, hours: Math.round(h * 4) / 4 });
        break;
      }
      case "workout": {
        const m = minutesOf(it);
        if (m === null || m < 1 || m > 960) {
          plan.skipped += 1;
          break;
        }
        const w = workoutName(it.kind, ctx.locale);
        plan.entries.push({
          date,
          description: w.name,
          focus_minutes: Math.round(m),
          intensity: intensityOf(it.intensity, w.intensity),
          novelty: 1,
          skills: alloc(w.name),
          confidence: 0.9,
          evidence: en ? "workout from the watch" : "тренировка с часов",
          client_ref: `device:workout:${(it.started_at ?? `${date}:${it.kind}:${Math.round(m)}`).slice(0, 90)}`,
        });
        break;
      }
      case "walking": {
        const m = it.minutes ?? (it.steps !== undefined ? it.steps / STEPS_PER_MINUTE : null);
        if (m === null || m < MIN_WALK_MINUTES) {
          plan.skipped += 1;
          break;
        }
        const name = en ? "Walking" : "Ходьба";
        plan.entries.push({
          date,
          description: name,
          focus_minutes: Math.min(960, Math.round(m)),
          intensity: 0.5,
          novelty: 0.9,
          skills: alloc(name),
          confidence: it.minutes !== undefined ? 0.8 : 0.6,
          evidence: it.steps !== undefined ? (en ? `${Math.round(it.steps)} steps` : `${Math.round(it.steps)} шагов`) : en ? "walking from the watch" : "ходьба с часов",
          client_ref: `device:walking:${date}`,
        });
        break;
      }
      case "activity": {
        if (!(it.minutes >= 1 && it.minutes <= 960)) {
          plan.skipped += 1;
          break;
        }
        plan.entries.push({
          date,
          description: it.name,
          focus_minutes: Math.round(it.minutes),
          intensity: intensityOf(it.intensity, 1),
          novelty: 1,
          skills: alloc(it.name),
          confidence: 0.7,
          evidence: en ? "automation" : "автоматизация",
          client_ref: `device:activity:${(it.ref ?? it.started_at ?? `${date}:${it.name}:${Math.round(it.minutes)}`).slice(0, 90)}`,
        });
        break;
      }
    }
  }
  return plan;
}

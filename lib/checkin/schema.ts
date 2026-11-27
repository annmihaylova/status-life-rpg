/**
 * Формат ответа LLM при разборе вечернего отчёта (SPEC 8).
 *
 * Схема без числовых ограничений: structured outputs их не поддерживает, диапазоны
 * проверяет и исправляет normalize.ts. Ссылки на навыки и записи — короткие локальные
 * метки (s1, e1), чтобы в LLM не уходили идентификаторы из базы.
 */
import { z } from "zod";
import { PART_KEYS } from "@/lib/game/attributes";

const part = z.enum(PART_KEYS);

export const llmCheckinSchema = z.object({
  entries: z.array(
    z.object({
      description: z.string(),
      focus_minutes: z.number(),
      intensity: z.number(),
      novelty: z.number(),
      skills: z.array(
        z.object({
          skill_ref: z.string().nullable(),
          cluster: z.string().nullable(),
          share: z.number(),
        }),
      ),
      attribute_tags: z.object({ primary: part.nullable(), secondary: part.nullable() }).nullable(),
      is_rest: z.boolean(),
      merge_with: z.string().nullable(),
      confidence: z.number(),
      quote: z.string(),
    }),
  ),
  new_clusters: z.array(
    z.object({
      cluster: z.string(),
      suggested_skill_name: z.string(),
      scope: z.string(),
      attribute_tags: z.object({ primary: part, secondary: part.nullable() }),
      is_work_shift: z.boolean(),
      is_rest: z.boolean(),
    }),
  ),
  wellbeing: z.object({
    sleep_hours: z.number().nullable(),
    mood_1_5: z.number().nullable(),
    sick: z.boolean().nullable(),
    rest_day: z.boolean().nullable(),
  }),
  clarifying_questions: z.array(z.string()),
});

export type LlmCheckin = z.infer<typeof llmCheckinSchema>;

/** Что Система знает на момент разбора (без идентификаторов из БД). */
export interface CheckinContext {
  date: string;
  skills: { ref: string; name: string; scope: string }[];
  candidates: { cluster: string; name: string }[];
  dayEntries: { ref: string; description: string; minutes: number; skills: string[] }[];
}

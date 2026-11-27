/**
 * Замеры навыков (фаза 3d): запись и чтение. Общая логика для серверных действий и MCP.
 * На пересчёт не влияют — опыт и уровни от замеров не меняются.
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/lib/db/client";
import { skillMeasurements, skills } from "@/lib/db/schema";
import { isIsoDate, type IsoDate } from "@/lib/game/dates";
import { parseMeasurement, SCALE_KEYS, SCALES, trend, type ScaleKey, type Trend } from "@/lib/game/measurements";

export const measurementInput = z.object({
  skillId: z.uuid(),
  scale: z.enum(SCALE_KEYS),
  value: z.string().trim().min(1).max(40),
  unit: z.string().trim().max(20).nullish(),
  measuredOn: z.string().refine(isIsoDate),
  note: z.string().trim().max(200).nullish(),
});
export type MeasurementInput = z.input<typeof measurementInput>;

export type AddResult = { ok: true; id: string } | { ok: false; error: "bad_value" | "skill_not_found" | "future_date" };

export async function addMeasurement(
  tx: Tx,
  userId: string,
  input: MeasurementInput,
  today: IsoDate,
  source: "manual" | "mcp",
): Promise<AddResult> {
  const v = measurementInput.parse(input);
  if (v.measuredOn > today) return { ok: false, error: "future_date" };
  const parsed = parseMeasurement(v.scale, v.value);
  if (!parsed.ok) return { ok: false, error: "bad_value" };
  const [skill] = await tx
    .select({ id: skills.id })
    .from(skills)
    .where(and(eq(skills.id, v.skillId), eq(skills.userId, userId)));
  if (!skill) return { ok: false, error: "skill_not_found" };
  const def = SCALES[v.scale];
  const [row] = await tx
    .insert(skillMeasurements)
    .values({
      userId,
      skillId: v.skillId,
      scale: v.scale,
      valueNum: parsed.value.num,
      valueText: parsed.value.text,
      unit: def.kind === "number" && def.customUnit ? (v.unit ?? null) : null,
      note: v.note ?? null,
      measuredOn: v.measuredOn,
      source,
    })
    .returning({ id: skillMeasurements.id });
  return { ok: true, id: row.id };
}

export interface LatestMeasurement {
  id: string;
  scale: ScaleKey;
  text: string;
  unit: string | null;
  measuredOn: IsoDate;
  note: string | null;
  /** по сравнению с прошлым замером той же шкалы (и единицы) */
  trend: Trend;
}

/** Последний замер каждого навыка (по каждой шкале навыка — последний; показываем самый свежий). */
export async function latestMeasurements(tx: Tx, userId: string): Promise<Map<string, LatestMeasurement>> {
  const rows = await tx
    .select()
    .from(skillMeasurements)
    .where(eq(skillMeasurements.userId, userId))
    .orderBy(desc(skillMeasurements.measuredOn), desc(skillMeasurements.createdAt));
  const out = new Map<string, LatestMeasurement>();
  for (const r of rows) {
    if (out.has(r.skillId)) continue;
    const scale = r.scale as ScaleKey;
    const prev = rows.find(
      (p) => p.id !== r.id && p.skillId === r.skillId && p.scale === r.scale && p.unit === r.unit &&
        (p.measuredOn < r.measuredOn || (p.measuredOn === r.measuredOn && p.createdAt < r.createdAt)),
    );
    out.set(r.skillId, {
      id: r.id,
      scale,
      text: r.valueText,
      unit: r.unit,
      measuredOn: r.measuredOn,
      note: r.note,
      trend: prev ? trend(scale, prev.valueNum, r.valueNum) : null,
    });
  }
  return out;
}

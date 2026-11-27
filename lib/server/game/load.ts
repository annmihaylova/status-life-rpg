/**
 * Сборка входа движка из БД для одного пользователя.
 * Никакой игровой логики: только чтение строк и перевод в типы движка.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { GENERAL_KEYS, isPartKey, type PartKey } from "@/lib/game/attributes";
import { DEFAULT_EXPERIMENTS, type Experiments } from "@/lib/game/config";
import { localDate, type IsoDate } from "@/lib/game/dates";
import type {
  DayWellbeing,
  EngineDecision,
  EngineEntry,
  EngineInput,
  SkillDef,
} from "@/lib/game/engine/types";
import { skillDomain } from "@/lib/game/progression";
import type { DbOrTx } from "@/lib/db/client";
import {
  activityEntries,
  entrySkillAllocations,
  gameDecisions,
  hpDays,
  profiles,
  skillCandidates,
  skills,
  userSettings,
} from "@/lib/db/schema";

const variant = z.enum(["A", "B", "C"]);
const experimentsSchema = z
  .object({ restDay: variant, secondWind: variant, noSkillAttributeWeight: variant })
  .partial();

const slot = z.enum(["main", "secondary", "none"]);
const general = z.enum(GENERAL_KEYS);
const attrValues = z.record(z.string(), z.number().int());

/** Схемы payload решений: битые строки пропускаются, а не роняют пересчёт. */
const payloadSchemas = {
  take_skill: z.object({ skillId: z.string(), slot, clusterKey: z.string().nullish() }),
  add_sleeping_skill: z.object({ skillId: z.string() }),
  archive_skill: z.object({ skillId: z.string() }),
  restore_skill: z.object({ skillId: z.string(), slot }),
  move_slot: z.object({ skillId: z.string(), slot }),
  snooze_skill: z.object({ clusterKey: z.string() }),
  decline_skill: z.object({ clusterKey: z.string() }),
  choose_specialization: z.object({
    skillId: z.string(),
    milestone: z.number().int(),
    name: z.string(),
  }),
  assessment: z.object({ bonuses: z.record(general, z.number()) }),
  calibration_move: z.object({
    kind: z.enum(["start", "unfold"]),
    general: general.optional(),
    values: attrValues,
  }),
  calibration_finish: z.object({ kind: z.enum(["start", "unfold"]), general: general.optional() }),
  unfold: z.object({ general }),
  decline_unfold: z.object({ general }),
} as const;

export interface LoadedInput {
  input: EngineInput;
  timezone: string;
  /** решения, которые не прошли проверку формата */
  skippedDecisions: string[];
}

export async function loadEngineInput(db: DbOrTx, userId: string, now: Date): Promise<LoadedInput> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
  if (!profile) throw new Error(`profile not found: ${userId}`);
  const tz = profile.timezone || "UTC";
  const toLocal = (d: Date) => localDate(d, tz);

  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const parsedExp = experimentsSchema.safeParse(settings?.experiments ?? {});
  const experiments: Experiments = {
    ...DEFAULT_EXPERIMENTS,
    ...(parsedExp.success ? parsedExp.data : {}),
  };

  const skillRows = await db.select().from(skills).where(eq(skills.userId, userId));
  const skillDefs: SkillDef[] = skillRows.map((s) => ({
    id: s.id,
    primaryAttr: asPart(s.primaryAttrKey),
    secondaryAttr: asPart(s.secondaryAttrKey),
    isWorkShift: s.isWorkShift,
    isRest: s.isRest,
    domain: skillDomain(s.domain, asPart(s.primaryAttrKey)),
    sleepingTargetLevel: s.sleepingTargetLevel,
  }));

  const entryRows = await db
    .select()
    .from(activityEntries)
    .where(and(eq(activityEntries.userId, userId), eq(activityEntries.status, "confirmed")))
    .orderBy(asc(activityEntries.date));
  const ids = entryRows.map((e) => e.id);
  const allocRows = ids.length
    ? await db.select().from(entrySkillAllocations).where(inArray(entrySkillAllocations.entryId, ids))
    : [];
  const allocByEntry = new Map<string, typeof allocRows>();
  for (const a of allocRows) {
    const list = allocByEntry.get(a.entryId) ?? [];
    list.push(a);
    allocByEntry.set(a.entryId, list);
  }

  const entries: EngineEntry[] = entryRows.map((e) => {
    const tags = (e.attributeTags ?? null) as { primary?: unknown; secondary?: unknown } | null;
    return {
      id: e.id,
      date: e.date,
      orderKey: (e.startedAt ?? e.createdAt).toISOString(),
      focusMinutes: e.focusMinutes,
      intensity: e.intensity,
      novelty: e.novelty,
      isRest: e.isRest,
      allocations: (allocByEntry.get(e.id) ?? [])
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((a) => ({
          skillId: a.skillId,
          cluster: a.activityCluster,
          share: a.share,
          matchesSpecialization: a.matchesSpecialization,
        })),
      attributeTags: tags
        ? { primary: asPart(tags.primary), secondary: asPart(tags.secondary) }
        : null,
    };
  });

  const decisionRows = await db
    .select()
    .from(gameDecisions)
    .where(eq(gameDecisions.userId, userId))
    .orderBy(asc(gameDecisions.decidedAt));
  const skippedDecisions: string[] = [];
  const decisions: EngineDecision[] = [];
  for (const d of decisionRows) {
    const schema = payloadSchemas[d.kind as keyof typeof payloadSchemas];
    const parsed = schema?.safeParse(d.payload);
    if (!parsed?.success) {
      // set_skill_tags, wear_title, set_experiments и т.п. не влияют на пересчёт
      if (schema) skippedDecisions.push(d.id);
      continue;
    }
    decisions.push({
      id: d.id,
      kind: d.kind,
      date: toLocal(d.decidedAt),
      at: d.decidedAt.toISOString(),
      payload: parsed.data,
    } as EngineDecision);
  }

  const hpRows = await db.select().from(hpDays).where(eq(hpDays.userId, userId));
  const wellbeing: Record<IsoDate, DayWellbeing> = {};
  for (const h of hpRows) {
    const hasInput =
      h.sleepHours != null || h.mood1to5 != null || h.sick || h.manualRest || h.llmRestDay != null;
    if (!hasInput) continue;
    wellbeing[h.date] = {
      sleepHours: h.sleepHours,
      mood1to5: h.mood1to5,
      sick: h.sick,
      manualRest: h.manualRest,
      llmRestDay: h.llmRestDay,
    };
  }

  const requested = await db
    .select({ cluster: skillCandidates.clusterKey })
    .from(skillCandidates)
    .where(and(eq(skillCandidates.userId, userId), eq(skillCandidates.requested, true)));

  return {
    timezone: tz,
    skippedDecisions,
    input: {
      registeredOn: toLocal(profile.createdAt),
      today: toLocal(now),
      experiments,
      skills: skillDefs,
      entries,
      decisions,
      wellbeing,
      requestedClusters: requested.map((r) => r.cluster),
    },
  };
}

function asPart(v: unknown): PartKey | null {
  return typeof v === "string" && isPartKey(v) ? v : null;
}


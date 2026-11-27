/**
 * Серверная проверка ответа LLM (SPEC 8): ссылки → id, доли → сумма 1, диапазоны коэффициентов,
 * focus_minutes 1…960, не больше 3 навыков на запись, ключи кластеров, самочувствие.
 * Чистая функция: никаких запросов к БД.
 */
import { isPartKey, type PartKey } from "@/lib/game/attributes";
import { GAME_CONFIG } from "@/lib/game/config";
import { normalizeShares } from "@/lib/game/formulas";
import type { LlmCheckin } from "./schema";

const E = GAME_CONFIG.entry;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface DraftAllocation {
  skillId: string | null;
  cluster: string | null;
  share: number;
}

export interface DraftEntry {
  description: string;
  focusMinutes: number;
  intensity: number;
  novelty: number;
  isRest: boolean;
  allocations: DraftAllocation[];
  attributeTags: { primary: PartKey | null; secondary: PartKey | null } | null;
  mergeWith: string | null;
  confidence: number;
  quote: string;
}

export interface DraftCluster {
  cluster: string;
  name: string;
  scope: string;
  primary: PartKey;
  secondary: PartKey | null;
  isWorkShift: boolean;
  isRest: boolean;
}

export interface NormalizedCheckin {
  entries: DraftEntry[];
  clusters: DraftCluster[];
  wellbeing: { sleepHours: number | null; mood: number | null; sick: boolean | null; restDay: boolean | null };
  questions: string[];
}

/** Стабильный читаемый ключ кластера (тот же, что у ручного лога). */
export function clusterKeyOf(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeCheckin(
  raw: LlmCheckin,
  refs: { skills: Map<string, string>; entries: Map<string, string> },
): NormalizedCheckin {
  const clusters = new Map<string, DraftCluster>();
  for (const c of raw.new_clusters) {
    const key = clusterKeyOf(c.cluster || c.suggested_skill_name);
    if (!key || !isPartKey(c.attribute_tags.primary)) continue;
    clusters.set(key, {
      cluster: key,
      name: c.suggested_skill_name.trim().slice(0, 60) || key,
      scope: c.scope.trim().slice(0, 300),
      primary: c.attribute_tags.primary,
      secondary:
        c.attribute_tags.secondary && c.attribute_tags.secondary !== c.attribute_tags.primary
          ? c.attribute_tags.secondary
          : null,
      isWorkShift: c.is_work_shift,
      isRest: c.is_rest,
    });
  }

  const entries: DraftEntry[] = [];
  for (const e of raw.entries) {
    const description = e.description.trim().slice(0, 300);
    if (!description || !Number.isFinite(e.focus_minutes) || e.focus_minutes <= 0) continue;

    const allocs: DraftAllocation[] = [];
    for (const s of e.skills) {
      const skillId = s.skill_ref ? (refs.skills.get(s.skill_ref) ?? null) : null;
      const cluster = !skillId && s.cluster ? clusterKeyOf(s.cluster) || null : null;
      if (!skillId && !cluster) continue;
      allocs.push({ skillId, cluster, share: s.share });
    }
    // объединяем повторы одного навыка/кластера, берём не больше трёх самых крупных
    const merged = new Map<string, DraftAllocation>();
    for (const a of allocs) {
      const k = a.skillId ?? `c:${a.cluster}`;
      const prev = merged.get(k);
      merged.set(k, prev ? { ...prev, share: prev.share + a.share } : a);
    }
    const top = [...merged.values()].sort((a, b) => b.share - a.share).slice(0, E.maxSkillsPerEntry);
    const shares = normalizeShares(top);
    const finalAllocs = shares.length ? shares : top.map((a) => ({ ...a, share: 1 / top.length }));

    const tags = e.attribute_tags;
    entries.push({
      description,
      focusMinutes: Math.round(clamp(e.focus_minutes, E.focusMinutes.min, E.focusMinutes.max)),
      intensity: round2(clamp(e.intensity, E.intensity.min, E.intensity.max)),
      novelty: round2(clamp(e.novelty, E.novelty.min, E.novelty.max)),
      isRest: e.is_rest,
      allocations: finalAllocs,
      attributeTags:
        tags && (tags.primary || tags.secondary)
          ? { primary: tags.primary ?? null, secondary: tags.secondary ?? null }
          : null,
      mergeWith: e.merge_with ? (refs.entries.get(e.merge_with) ?? null) : null,
      confidence: round2(clamp(Number.isFinite(e.confidence) ? e.confidence : 0.5, 0, 1)),
      quote: e.quote.trim().slice(0, 500),
    });
  }

  const w = raw.wellbeing;
  return {
    entries,
    clusters: [...clusters.values()],
    wellbeing: {
      sleepHours: w.sleep_hours != null && w.sleep_hours >= 0 && w.sleep_hours <= 16 ? round2(w.sleep_hours) : null,
      mood: w.mood_1_5 != null && w.mood_1_5 >= 1 && w.mood_1_5 <= 5 ? Math.round(w.mood_1_5) : null,
      sick: w.sick,
      restDay: w.rest_day,
    },
    questions: raw.clarifying_questions.map((q) => q.trim()).filter(Boolean).slice(0, 3),
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

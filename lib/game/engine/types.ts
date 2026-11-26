/**
 * Вход и выход игрового движка. Движок — чистая функция replay(input) → result:
 * всё состояние персонажа выводится из подтверждённых записей и журнала решений.
 */
import type { AttributeKey, GeneralKey, PartKey } from "../attributes";
import type { Experiments } from "../config";
import type { IsoDate } from "../dates";
import type { HpResult, StatusEffect } from "../hp";

export type SkillSlot = "main" | "secondary" | "none";
export type SkillStatus = "active" | "sleeping" | "archived" | "pending";

/** Определение навыка (строка skills): то, что не меняется во времени. */
export interface SkillDef {
  id: string;
  primaryAttr: PartKey | null;
  secondaryAttr: PartKey | null;
  isWorkShift: boolean;
  isRest: boolean;
  /** для спящего навыка — целевой уровень (из оценки прошлых часов) */
  sleepingTargetLevel: number | null;
}

export interface EngineAllocation {
  /** навык; null — активность ещё не навык */
  skillId: string | null;
  /** кластер активности (кандидат в навык) */
  cluster: string | null;
  share: number;
  /** запись подходит под специализацию навыка (+10%) */
  matchesSpecialization?: boolean;
}

export interface EngineEntry {
  id: string;
  date: IsoDate;
  /** для порядка внутри дня: started_at или created_at (ISO) */
  orderKey: string;
  focusMinutes: number;
  intensity: number;
  novelty: number;
  isRest: boolean;
  allocations: EngineAllocation[];
  /** теги для активности без навыка */
  attributeTags: { primary: PartKey | null; secondary: PartKey | null } | null;
}

export type EngineDecision =
  | Decision<"take_skill", { skillId: string; slot: SkillSlot; clusterKey?: string | null }>
  | Decision<"add_sleeping_skill", { skillId: string }>
  | Decision<"archive_skill", { skillId: string }>
  | Decision<"restore_skill", { skillId: string; slot: SkillSlot }>
  | Decision<"move_slot", { skillId: string; slot: SkillSlot }>
  | Decision<"snooze_skill", { clusterKey: string }>
  | Decision<"decline_skill", { clusterKey: string }>
  | Decision<"choose_specialization", { skillId: string; milestone: number; name: string }>
  | Decision<"assessment", { bonuses: Partial<Record<GeneralKey, number>> }>
  | Decision<
      "calibration_move",
      { kind: "start" | "unfold"; general?: GeneralKey; values: Partial<Record<AttributeKey, number>> }
    >
  | Decision<"calibration_finish", { kind: "start" | "unfold"; general?: GeneralKey }>
  | Decision<"unfold", { general: GeneralKey }>
  | Decision<"decline_unfold", { general: GeneralKey }>;

interface Decision<K extends string, P> {
  id: string;
  kind: K;
  /** локальная дата решения */
  date: IsoDate;
  /** момент решения (ISO) — порядок внутри дня */
  at: string;
  payload: P;
}

export interface DayWellbeing {
  sleepHours: number | null;
  mood1to5: number | null;
  sick: boolean;
  manualRest: boolean;
  llmRestDay: boolean | null;
}

export interface EngineInput {
  registeredOn: IsoDate;
  today: IsoDate;
  experiments: Experiments;
  skills: SkillDef[];
  entries: EngineEntry[];
  decisions: EngineDecision[];
  wellbeing: Record<IsoDate, DayWellbeing>;
  /** кластеры, которые пользователь сам попросил сделать навыком */
  requestedClusters: string[];
}

export interface XpLedgerEvent {
  entryId: string;
  targetType: "character" | "skill" | "candidate" | "attribute";
  targetId: string;
  amount: number;
  multipliers: Record<string, number | string | boolean>;
}

export type GameEvent = { id: string; date: IsoDate; entryId?: string } & (
  | { type: "level_up"; from: number; to: number }
  | { type: "slot_unlocked"; slot: "main" | "secondary"; total: number }
  | { type: "skill_level_up"; skillId: string; from: number; to: number }
  | { type: "skill_rank_up"; skillId: string; rank: string }
  | { type: "skill_awakened"; skillId: string }
  | { type: "skill_offer"; cluster: string }
  | { type: "specialization_available"; skillId: string; milestone: number }
  | { type: "attribute_star"; attribute: AttributeKey; stars: number }
  | { type: "attribute_point"; attribute: AttributeKey; from: number; to: number }
  | { type: "unfold_available"; general: GeneralKey }
  | { type: "unfolded"; general: GeneralKey; values: Partial<Record<PartKey, number>> }
);

export interface SkillState {
  id: string;
  status: SkillStatus;
  slot: SkillSlot;
  xp: number;
  level: number;
  awakenedOn: IsoDate | null;
  takenOn: IsoDate | null;
  specializations: { milestone: number; name: string }[];
  /** вехи, на которых специализация доступна, но ещё не выбрана */
  pendingSpecializations: number[];
}

export interface CandidateState {
  cluster: string;
  xpPool: number;
  minutesTotal: number;
  daysSeen: number;
  firstSeen: IsoDate | null;
  lastSeen: IsoDate | null;
  offerStatus: "accruing" | "offered" | "snoozed" | "declined" | "accepted";
  offeredOn: IsoDate | null;
}

export interface AttributeState {
  key: AttributeKey;
  state: "general" | "unfolded" | "part";
  value: number;
  pool: number;
  stars: number;
  activeDaysSincePoint: number;
  xpTotal: number;
  activeDaysTotal: number;
  unfoldOfferedOn: IsoDate | null;
  unfoldedOn: IsoDate | null;
}

export interface HpDayState extends HpResult {
  date: IsoDate;
  effects: StatusEffect[];
  restDay: boolean;
}

export interface EngineResult {
  character: { totalXp: number; level: number; xpIntoLevel: number; xpForLevel: number };
  skills: Record<string, SkillState>;
  candidates: Record<string, CandidateState>;
  attributes: Partial<Record<AttributeKey, AttributeState>>;
  /** скрытые пометки XP общих характеристик по частям (для раскрытия) */
  attributeTagXp: Partial<Record<GeneralKey, Partial<Record<PartKey, number>>>>;
  hpDays: Record<IsoDate, HpDayState>;
  ledger: XpLedgerEvent[];
  events: GameEvent[];
  /** решения, которые движок не смог применить (некорректная калибровка и т.п.) */
  rejectedDecisions: { id: string; reason: string }[];
}

/**
 * Схема БД (SPEC раздел 10 + решения из docs/PLAN.md).
 * RLS включена на всех таблицах. Политики описаны здесь же и попадают в миграции drizzle-kit.
 *
 * Правило доступа:
 * - обычные таблицы: пользователь читает и пишет только свои строки (user_id = auth.uid());
 * - леджер и выданное Системой (xp_events, user_titles, api_tokens): только чтение своих строк,
 *   пишет серверный код игрового движка привилегированным подключением;
 * - справочники (attributes, titles): чтение всем.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { anonRole, authenticatedRole, authUsers } from "drizzle-orm/supabase";

// ───────────────────────── helpers ─────────────────────────

const uid = sql`(select auth.uid())`;

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" });

/** Полный доступ к своим строкам. */
function ownRows(name: string, col: AnyPgColumn | SQL) {
  const own = sql`${col} = ${uid}`;
  return [
    pgPolicy(`${name}_select_own`, { for: "select", to: authenticatedRole, using: own }),
    pgPolicy(`${name}_insert_own`, { for: "insert", to: authenticatedRole, withCheck: own }),
    pgPolicy(`${name}_update_own`, {
      for: "update",
      to: authenticatedRole,
      using: own,
      withCheck: own,
    }),
    pgPolicy(`${name}_delete_own`, { for: "delete", to: authenticatedRole, using: own }),
  ];
}

/** Только чтение своих строк. */
function readOwnRows(name: string, col: AnyPgColumn) {
  return [
    pgPolicy(`${name}_select_own`, {
      for: "select",
      to: authenticatedRole,
      using: sql`${col} = ${uid}`,
    }),
  ];
}

/** Справочник: читают все. */
function publicRead(name: string) {
  return [
    pgPolicy(`${name}_select_all`, {
      for: "select",
      to: [anonRole, authenticatedRole],
      using: sql`true`,
    }),
  ];
}

// ───────────────────────── enums ─────────────────────────

export const attributeStateEnum = pgEnum("attribute_state", ["general", "unfolded", "part"]);
export const calibrationKindEnum = pgEnum("calibration_kind", ["start", "unfold"]);
export const skillSlotEnum = pgEnum("skill_slot", ["main", "secondary", "none"]);
export const skillStatusEnum = pgEnum("skill_status", ["active", "sleeping", "archived"]);
export const offerStatusEnum = pgEnum("offer_status", [
  "accruing",
  "offered",
  "snoozed",
  "declined",
  "accepted",
]);
export const entrySourceEnum = pgEnum("entry_source", [
  "mcp_claude",
  "mcp_chatgpt",
  "mcp_other",
  "checkin",
  "manual",
  "timer",
  /** часы и телефон через /api/ingest (фаза 3d) */
  "device",
]);
export const entryStatusEnum = pgEnum("entry_status", ["draft", "confirmed", "rejected"]);
export const xpTargetEnum = pgEnum("xp_target", ["character", "skill", "candidate", "attribute"]);
export const checkinStatusEnum = pgEnum("checkin_status", ["pending", "parsed", "confirmed"]);
export const decisionKindEnum = pgEnum("decision_kind", [
  "take_skill",
  "snooze_skill",
  "decline_skill",
  "archive_skill",
  "restore_skill",
  "move_slot",
  "add_sleeping_skill",
  "update_sleeping_estimate",
  "choose_specialization",
  "set_skill_tags",
  "assessment",
  "calibration_move",
  "calibration_finish",
  "unfold",
  "decline_unfold",
  "wear_title",
  "set_experiments",
  "choose_side_class",
]);

// ───────────────────────── профиль и настройки ─────────────────────────

/** SPEC: users. Email живёт в auth.users и сюда не копируется. */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    locale: text("locale").notNull().default("ru"),
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: createdAt(),
  },
  (t) => [...ownRows("profiles", t.id)],
).enableRLS();

export const userSettings = pgTable(
  "user_settings",
  {
    userId: userId().primaryKey(),
    autoConfirmAi: boolean("auto_confirm_ai").notNull().default(false),
    /** варианты из PLAN 2б: { restDay, secondWind, noSkillAttributeWeight } */
    experiments: jsonb("experiments").notNull().default({}),
    largeText: boolean("large_text").notNull().default(false),
    soundEnabled: boolean("sound_enabled").notNull().default(true),
    theme: text("theme").notNull().default("dark"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [...ownRows("user_settings", t.userId)],
).enableRLS();

export const onboardingProfiles = pgTable(
  "onboarding_profiles",
  {
    userId: userId().primaryKey(),
    ageBand: text("age_band"),
    occupations: text("occupations").array().notNull().default(sql`'{}'::text[]`),
    groups: text("groups").array().notNull().default(sql`'{}'::text[]`),
    goals: text("goals").array().notNull().default(sql`'{}'::text[]`),
    aboutText: text("about_text"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [...ownRows("onboarding_profiles", t.userId)],
).enableRLS();

// ───────────────────────── персонаж ─────────────────────────

export const titles = pgTable(
  "titles",
  {
    key: text("key").primaryKey(),
    nameRu: text("name_ru").notNull(),
    nameEn: text("name_en").notNull(),
    rule: jsonb("rule").notNull(),
  },
  () => [...publicRead("titles")],
).enableRLS();

export const characters = pgTable(
  "characters",
  {
    userId: userId().primaryKey(),
    gameName: text("game_name"),
    titleKey: text("title_key").references(() => titles.key, { onDelete: "set null" }),
    classKey: text("class_key"),
    avatarConfig: jsonb("avatar_config").notNull().default({}),
    avatarVrmPath: text("avatar_vrm_path"),
    levelCache: integer("level_cache").notNull().default(1),
    totalXpCache: doublePrecision("total_xp_cache").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [...ownRows("characters", t.userId)],
).enableRLS();

export const userTitles = pgTable(
  "user_titles",
  {
    userId: userId(),
    titleKey: text("title_key")
      .notNull()
      .references(() => titles.key, { onDelete: "cascade" }),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleKey] }), ...readOwnRows("user_titles", t.userId)],
).enableRLS();

// ───────────────────────── характеристики ─────────────────────────

/** Справочник: 3 общих + 9 частей, seed из lib/game/data/attributes.json. */
export const attributes = pgTable(
  "attributes",
  {
    key: text("key").primaryKey(),
    parentKey: text("parent_key").references((): AnyPgColumn => attributes.key),
    nameRu: text("name_ru").notNull(),
    nameEn: text("name_en").notNull(),
    descriptionRu: text("description_ru"),
    descriptionEn: text("description_en"),
    sortOrder: integer("sort_order").notNull(),
  },
  () => [...publicRead("attributes")],
).enableRLS();

export const userAttributes = pgTable(
  "user_attributes",
  {
    userId: userId(),
    attributeKey: text("attribute_key")
      .notNull()
      .references(() => attributes.key),
    value: integer("value").notNull().default(10),
    xpPool: doublePrecision("xp_pool").notNull().default(0),
    activeDaysSincePoint: integer("active_days_since_point").notNull().default(0),
    xpTotal: doublePrecision("xp_total").notNull().default(0),
    activeDaysTotal: integer("active_days_total").notNull().default(0),
    state: attributeStateEnum("state").notNull().default("general"),
    unfoldOfferedAt: timestamp("unfold_offered_at", { withTimezone: true }),
    unfoldedAt: timestamp("unfolded_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.attributeKey] }),
    ...ownRows("user_attributes", t.userId),
  ],
).enableRLS();

/** Скрытые пометки XP для честного раскрытия (SPEC 2.4.4). */
export const attributeXpTags = pgTable(
  "attribute_xp_tags",
  {
    userId: userId(),
    generalKey: text("general_key")
      .notNull()
      .references(() => attributes.key),
    partKey: text("part_key")
      .notNull()
      .references(() => attributes.key),
    xp: doublePrecision("xp").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.generalKey, t.partKey] }),
    ...ownRows("attribute_xp_tags", t.userId),
  ],
).enableRLS();

export const calibrations = pgTable(
  "calibrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    kind: calibrationKindEnum("kind").notNull(),
    generalKey: text("general_key").references(() => attributes.key),
    pointsTotal: integer("points_total").notNull(),
    pointsUsed: integer("points_used").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    moves: jsonb("moves").notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("calibrations_user_idx").on(t.userId), ...ownRows("calibrations", t.userId)],
).enableRLS();

export const attributeAssessment = pgTable(
  "attribute_assessment",
  {
    userId: userId().primaryKey(),
    values: jsonb("values").notNull(),
    explanations: jsonb("explanations").notNull(),
    createdAt: createdAt(),
  },
  (t) => [...ownRows("attribute_assessment", t.userId)],
).enableRLS();

// ───────────────────────── навыки ─────────────────────────

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    /** как показан в окне статуса: «Книжный червь» (PLAN 2а) */
    name: text("name").notNull(),
    /** что в него засчитывается; по этому полю классификатор раскладывает записи */
    scope: text("scope").notNull().default(""),
    domain: text("domain"),
    clusterKey: text("cluster_key"),
    isWorkShift: boolean("is_work_shift").notNull().default(false),
    isRest: boolean("is_rest").notNull().default(false),
    primaryAttrKey: text("primary_attr_key").references(() => attributes.key),
    secondaryAttrKey: text("secondary_attr_key").references(() => attributes.key),
    slot: skillSlotEnum("slot").notNull().default("none"),
    status: skillStatusEnum("status").notNull().default("active"),
    sleepingPastHours: real("sleeping_past_hours"),
    sleepingTargetLevel: integer("sleeping_target_level"),
    awakenedAt: timestamp("awakened_at", { withTimezone: true }),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    slotChangedAt: timestamp("slot_changed_at", { withTimezone: true }),
    xpCache: doublePrecision("xp_cache").notNull().default(0),
    levelCache: integer("level_cache").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index("skills_user_idx").on(t.userId), ...ownRows("skills", t.userId)],
).enableRLS();

/**
 * Замеры навыка по внешней шкале (фаза 3d): CEFR, Elo, тест Купера… Второй вид прогресса
 * рядом с опытом: может понизиться, на XP не влияет (lib/game/measurements.ts).
 */
export const skillMeasurements = pgTable(
  "skill_measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    scale: text("scale").notNull(),
    /** число для сравнения: уровень CEFR как индекс, время — в секундах; у оценок — null */
    valueNum: doublePrecision("value_num"),
    valueText: text("value_text").notNull(),
    /** единица своего показателя */
    unit: text("unit"),
    note: text("note"),
    measuredOn: date("measured_on").notNull(),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [
    index("skill_measurements_skill_idx").on(t.skillId, t.measuredOn),
    ...ownRows("skill_measurements", t.userId),
  ],
).enableRLS();

export const skillSpecializations = pgTable(
  "skill_specializations",
  {
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    userId: userId(),
    milestoneLevel: integer("milestone_level").notNull(),
    name: text("name").notNull(),
    scope: text("scope").notNull().default(""),
    chosenAt: timestamp("chosen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.skillId, t.milestoneLevel] }),
    ...ownRows("skill_specializations", t.userId),
  ],
).enableRLS();

export const skillCandidates = pgTable(
  "skill_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    clusterKey: text("cluster_key").notNull(),
    suggestedName: text("suggested_name"),
    scope: text("scope").notNull().default(""),
    attributeTags: jsonb("attribute_tags"),
    isWorkShift: boolean("is_work_shift").notNull().default(false),
    /** создан по просьбе «хочу навык „Шахматы“» */
    requested: boolean("requested").notNull().default(false),
    xpPool: doublePrecision("xp_pool").notNull().default(0),
    minutesTotal: integer("minutes_total").notNull().default(0),
    daysSeen: integer("days_seen").notNull().default(0),
    firstSeen: date("first_seen"),
    lastSeen: date("last_seen"),
    offerStatus: offerStatusEnum("offer_status").notNull().default("accruing"),
    offeredAt: timestamp("offered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("skill_candidates_user_cluster_uq").on(t.userId, t.clusterKey),
    ...ownRows("skill_candidates", t.userId),
  ],
).enableRLS();

// ───────────────────────── записи и леджер ─────────────────────────

export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    date: date("date").notNull(),
    transcript: text("transcript").notNull(),
    audioPath: text("audio_path"),
    llmRaw: jsonb("llm_raw"),
    status: checkinStatusEnum("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("checkins_user_date_idx").on(t.userId, t.date), ...ownRows("checkins", t.userId)],
).enableRLS();

export const activityEntries = pgTable(
  "activity_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    date: date("date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    focusMinutes: integer("focus_minutes").notNull(),
    intensity: real("intensity").notNull().default(1),
    novelty: real("novelty").notNull().default(1),
    description: text("description").notNull(),
    source: entrySourceEnum("source").notNull(),
    status: entryStatusEnum("status").notNull().default("draft"),
    isRest: boolean("is_rest").notNull().default(false),
    /** теги характеристик для активности без навыка: { primary, secondary } */
    attributeTags: jsonb("attribute_tags"),
    confidence: real("confidence"),
    evidence: text("evidence"),
    clientRef: text("client_ref"),
    checkinId: uuid("checkin_id").references(() => checkins.id, { onDelete: "set null" }),
    /** черновик предлагает обновить уже существующую запись вместо дубля (SPEC 4.2) */
    mergeWith: uuid("merge_with").references((): AnyPgColumn => activityEntries.id, { onDelete: "cascade" }),
    /** id MCP-токена/клиента, создавшего запись: агент правит только свои черновики */
    createdByToken: uuid("created_by_token"),
    createdAt: createdAt(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    index("activity_entries_user_date_idx").on(t.userId, t.date),
    uniqueIndex("activity_entries_client_ref_uq").on(t.userId, t.date, t.clientRef),
    ...ownRows("activity_entries", t.userId),
  ],
).enableRLS();

export const entrySkillAllocations = pgTable(
  "entry_skill_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => activityEntries.id, { onDelete: "cascade" }),
    userId: userId(),
    /** null — ещё не навык, а кандидат (activity_cluster) */
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    activityCluster: text("activity_cluster"),
    share: real("share").notNull(),
    /** запись подходит под специализацию навыка (+10% XP), ставит классификатор */
    matchesSpecialization: boolean("matches_specialization").notNull().default(false),
  },
  (t) => [
    index("entry_skill_allocations_entry_idx").on(t.entryId),
    ...ownRows("entry_skill_allocations", t.userId),
  ],
).enableRLS();

/** Журнал решений пользователя — нужен для детерминированного пересчёта (PLAN 2, п. 1). */
export const gameDecisions = pgTable(
  "game_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    kind: decisionKindEnum("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("game_decisions_user_idx").on(t.userId, t.decidedAt),
    ...ownRows("game_decisions", t.userId),
  ],
).enableRLS();

/** Леджер начислений (SPEC 3.6). Пишет только движок. */
export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    entryId: uuid("entry_id").references(() => activityEntries.id, { onDelete: "cascade" }),
    targetType: xpTargetEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    amount: doublePrecision("amount").notNull(),
    multipliers: jsonb("multipliers").notNull().default({}),
    formulaVersion: integer("formula_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("xp_events_user_created_idx").on(t.userId, t.createdAt),
    ...readOwnRows("xp_events", t.userId),
  ],
).enableRLS();

// ───────────────────────── HP ─────────────────────────

export const hpDays = pgTable(
  "hp_days",
  {
    userId: userId(),
    date: date("date").notNull(),
    hpMax: integer("hp_max").notNull(),
    hpMorning: integer("hp_morning").notNull(),
    hpCurrent: integer("hp_current").notNull(),
    sleepHours: real("sleep_hours"),
    mood1to5: integer("mood_1_5"),
    sick: boolean("sick").notNull().default(false),
    /** «сегодня отдыхала» — засчитывается в любом варианте эксперимента */
    manualRest: boolean("manual_rest").notNull().default(false),
    /** эксперимент «день отдыха», вариант C: решение LLM по вечернему отчёту */
    llmRestDay: boolean("llm_rest_day"),
    effects: text("effects").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] }), ...ownRows("hp_days", t.userId)],
).enableRLS();

// ───────────────────────── уведомления и доступ ─────────────────────────

export const notificationSettings = pgTable(
  "notification_settings",
  {
    userId: userId().primaryKey(),
    checkinLocalTime: text("checkin_local_time").notNull().default("21:00"),
    channels: jsonb("channels").notNull().default({ push: true, email: false }),
    enabled: boolean("enabled").notNull().default(true),
    /** локальная дата последнего напоминания о чек-ине (не чаще раза в день) */
    lastSentOn: date("last_sent_on"),
  },
  (t) => [...ownRows("notification_settings", t.userId)],
).enableRLS();

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_uq").on(t.endpoint),
    ...ownRows("push_subscriptions", t.userId),
  ],
).enableRLS();

/** Персональные MCP-токены (SPEC 7.2). Хранится только хэш; создаёт сервер. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("api_tokens_hash_uq").on(t.tokenHash),
    ...readOwnRows("api_tokens", t.userId),
  ],
).enableRLS();

export const weeklyChronicles = pgTable(
  "weekly_chronicles",
  {
    userId: userId(),
    weekStart: date("week_start").notNull(),
    stats: jsonb("stats").notNull(),
    letterText: text("letter_text"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.weekStart] }),
    ...ownRows("weekly_chronicles", t.userId),
  ],
).enableRLS();

/**
 * Счётчики лимитов запросов (SPEC 11, фаза 5b): одна строка на пользователя и «корзину»
 * (mcp, ingest, llm, export, game…), фиксированное окно. Правила — lib/server/rate-limit.ts.
 * Служебная: RLS включена без политик и без прав — доступ только у сервера.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    userId: userId(),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bucket] })],
).enableRLS();

/**
 * Служебные секреты, которые сервер создаёт сам (ключи VAPID для web push).
 * RLS без политик и без прав: читает только сервер.
 */
export const appSecrets = pgTable("app_secrets", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: createdAt(),
}).enableRLS();

/**
 * Одноразовые токены планировщика: pg_cron кладёт токен сюда и передаёт его в запросе
 * к /api/cron/*, сервер проверяет и удаляет. Общий секрет вручную вводить не нужно.
 */
export const cronTokens = pgTable("cron_tokens", {
  token: text("token").primaryKey(),
  createdAt: createdAt(),
}).enableRLS();

/** Таблицы с данными пользователя — для теста RLS и экспорта. */
export const USER_TABLES = {
  profiles,
  user_settings: userSettings,
  onboarding_profiles: onboardingProfiles,
  characters,
  user_titles: userTitles,
  user_attributes: userAttributes,
  attribute_xp_tags: attributeXpTags,
  calibrations,
  attribute_assessment: attributeAssessment,
  skills,
  skill_specializations: skillSpecializations,
  skill_candidates: skillCandidates,
  checkins,
  activity_entries: activityEntries,
  entry_skill_allocations: entrySkillAllocations,
  game_decisions: gameDecisions,
  xp_events: xpEvents,
  hp_days: hpDays,
  notification_settings: notificationSettings,
  push_subscriptions: pushSubscriptions,
  api_tokens: apiTokens,
  weekly_chronicles: weeklyChronicles,
  skill_measurements: skillMeasurements,
} as const;

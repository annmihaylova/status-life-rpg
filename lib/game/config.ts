/**
 * Все игровые константы. Формулы — в formulas.ts, здесь только числа.
 * При изменении любого значения, влияющего на начисления, повышай FORMULA_VERSION
 * и запускай `pnpm game:recompute`.
 */
export const FORMULA_VERSION = 1;

export const GAME_CONFIG = {
  /** SPEC 3.2 */
  character: { base: 100, exponent: 1.2 },

  /** SPEC 3.3 */
  skill: { base: 15, exponent: 1.15 },

  /** SPEC 3.1 */
  entry: {
    intensity: { min: 0.5, max: 1.6, presets: [0.5, 1.0, 1.3, 1.6] },
    novelty: { min: 0.9, max: 1.2, presets: [0.9, 1.0, 1.2] },
    focusMinutes: { min: 1, max: 960 },
    /** мягкое предупреждение «похоже, есть пересечения» */
    dayWarnMinutes: 16 * 60,
    /** максимум навыков в одной записи (PLAN 2а) */
    maxSkillsPerEntry: 3,
  },

  /** Убывающая отдача на навык в календарный день, по минутам фокуса (SPEC 3.1) */
  diminishing: {
    normal: [
      { upToMinutes: 180, factor: 1.0 },
      { upToMinutes: 300, factor: 0.7 },
      { upToMinutes: Infinity, factor: 0.4 },
    ],
    workShift: [
      { upToMinutes: 480, factor: 1.0 },
      { upToMinutes: Infinity, factor: 0.7 },
    ],
  },

  /** Спящие навыки (SPEC 2.2) */
  sleeping: { multiplier: 5 },

  /** Ранги навыков (SPEC 2.2) */
  ranks: [
    { minLevel: 100, key: "master" },
    { minLevel: 75, key: "expert" },
    { minLevel: 50, key: "specialist" },
    { minLevel: 25, key: "journeyman" },
    { minLevel: 10, key: "apprentice" },
    { minLevel: 1, key: "novice" },
  ],

  /** Специализации (SPEC 2.2) */
  specialization: { milestones: [10, 25, 50, 75, 100], xpBonus: 0.1 },

  /** Слоты (SPEC 2.3) */
  slots: {
    main: { start: 4, milestones: [10, 25, 50, 75, 100], max: 9 },
    secondary: { start: 6, everyLevels: 10, max: 16 },
    /** XP второстепенного навыка идёт в характеристики с этим коэффициентом */
    secondaryAttributeFactor: 0.5,
    swapCooldownDays: 7,
  },

  /** Предложения навыков (SPEC 2.2, PLAN 2а) */
  skillOffers: {
    minMinutes: 120,
    minDistinctDays: 2,
    windowDays: 14,
    /** онбординг — без лимита; первые дни мягче; дальше недельный лимит */
    onboardingUnlimited: true,
    rampUpDays: 14,
    rampUpPerDay: 1,
    perWeek: 2,
  },

  /** Характеристики (SPEC 2.4, 3.4) */
  attributes: {
    base: 10,
    pointBase: 600,
    pointExponent: 1.2,
    starsPerPoint: 10,
    /** активный день для характеристики — ≥ 15 минут фокуса с её тегом */
    activeDayMinutes: 15,
    daysRequired: { start: 2, stepEvery: 2, max: 10 },
    tagWeights: { primary: 2 / 3, secondary: 1 / 3 },
    /** +2% XP навыку за очко основной характеристики выше 10, максимум +30% */
    skillBonusPerPoint: 0.02,
    skillBonusMax: 0.3,
    assessment: { maxPerAttribute: 6, maxTotal: 10 },
    startCalibration: { points: 5, days: 7, min: 10, max: 18 },
    unfold: {
      minCharacterLevel: 20,
      minXpSinceStart: 6000,
      minActiveDays: 30,
      calibrationPoints: 2,
      calibrationDays: 7,
      /** потолок калибровки после раскрытия = max(child) + это число */
      calibrationMaxOverChild: 2,
    },
  },

  /** HP (SPEC 2.6) */
  hp: {
    base: 100,
    perEndurancePoint: 10,
    perLevel: 2,
    /** утреннее HP по сну, доля от максимума; проверяется сверху вниз */
    sleep: [
      { minHours: 7, fraction: 1.0 },
      { minHours: 6, fraction: 0.8 },
      { minHours: 5, fraction: 0.6 },
      { minHours: 0, fraction: 0.45 },
    ],
    /** выше 9 часов сна — тоже 100% (SPEC: 7–9 → 100%) */
    noDataFraction: 0.9,
    heavyIntensity: 1.3,
    heavyLossPer60Min: 0.04,
    overloadMinutes: 10 * 60,
    overloadLoss: 0.1,
    restGainPer30Min: 0.05,
    restGainMaxPerDay: 0.3,
    lowThreshold: 0.3,
    lowRestMultiplier: 2,
    sickMaxPenalty: 0.3,
    lackOfSleepHours: 6,
    /** HP не падает ниже этой доли: «смерти персонажа» нет */
    floorFraction: 0.05,
  },

  /** Баффы (SPEC 2.6, PLAN 2б) */
  buffs: {
    recoveryXpBonus: 0.1,
  },

  /** Классы (SPEC 2.7): «не определён» до 10 уровня, дальше пересчёт по понедельникам. */
  classes: {
    unlockLevel: 10,
    /** опыт навыков по областям считается за последние N дней */
    domainWindowDays: 28,
  },

  /** Переключаемые эксперименты (PLAN 2б). По умолчанию — вариант A. */
  experiments: {
    restDay: {
      default: "A",
      A: { maxNonRestMinutes: 120, minRestMinutes: 60 },
    },
    secondWind: {
      default: "A",
      breakDays: 7,
      A: { characterXpBonus: 0.1, durationDays: 1, skillXpBonus: 0 },
      B: { characterXpBonus: 0, durationDays: 3, skillXpBonus: 0.2 },
      C: { characterXpBonus: 0, durationDays: 0, skillXpBonus: 0 },
    },
    noSkillAttributeWeight: {
      default: "A",
      A: 0.5,
      B: 1.0,
      C: 0.25,
    },
  },
} as const;

export type RestDayVariant = "A" | "B" | "C";
export type SecondWindVariant = "A" | "B" | "C";
export type NoSkillWeightVariant = "A" | "B" | "C";

export interface Experiments {
  restDay: RestDayVariant;
  secondWind: SecondWindVariant;
  noSkillAttributeWeight: NoSkillWeightVariant;
}

export const DEFAULT_EXPERIMENTS: Experiments = {
  restDay: "A",
  secondWind: "A",
  noSkillAttributeWeight: "A",
};

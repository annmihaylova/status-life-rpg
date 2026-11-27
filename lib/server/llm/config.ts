/** Настройки LLM (SPEC 8: модель — в конфиге, не в коде). */
export const LLM_CONFIG = {
  /** можно переопределить переменной LLM_MODEL */
  model: process.env.LLM_MODEL || "claude-opus-5-5",
  /** у Claude Opus 5.5 значение по умолчанию medium; задаём явно */
  effort: "medium" as const,
  maxTokens: 16000,
  /** месячный лимит LLM-вызовов на пользователя (SPEC 11) */
  monthlyCallsPerUser: Number(process.env.LLM_MONTHLY_LIMIT || 300),
  /** максимальная длина отчёта в символах */
  maxTranscriptChars: 6000,
};

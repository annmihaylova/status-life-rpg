/**
 * Лимиты запросов на пользователя (SPEC 11, фаза 5b). Фиксированное окно, счётчик в Postgres
 * (таблица rate_limits) — атомарно и одинаково для всех serverless-инстансов.
 */
import { sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/lib/db/client";
import { LLM_CONFIG } from "@/lib/server/llm/config";

/** окно: секунды или календарный месяц (UTC) */
export type LimitWindow = number | "month";

export const LIMITS = {
  /** MCP: инструменты Claude/ChatGPT (SPEC 7.5) */
  mcp: { max: 60, window: 60 },
  /** приём данных с часов и телефона */
  ingest: { max: 30, window: 60 },
  /** разбор текста через Claude: вечерний отчёт и рассказ в онбординге */
  llm: { max: 10, window: 60 },
  /** месячный лимит вызовов Claude — чтобы счёт за API не улетел (SPEC 11) */
  llm_month: { max: LLM_CONFIG.monthlyCallsPerUser, window: "month" },
  /** скачивание архива с данными */
  export: { max: 5, window: 600 },
  /** изменения в игре с полным пересчётом (записи, навыки, решения) */
  game: { max: 60, window: 60 },
} as const satisfies Record<string, { max: number; window: LimitWindow }>;

export type LimitBucket = keyof typeof LIMITS;

export interface SlotResult {
  ok: boolean;
  /** через сколько секунд откроется новое окно */
  retryAfter: number;
}

function windowStartSql(window: LimitWindow) {
  return window === "month"
    ? sql`date_trunc('month', now() at time zone 'utc') at time zone 'utc'`
    : sql`to_timestamp(floor(extract(epoch from now()) / ${window}) * ${window})`;
}

function windowEndSql(window: LimitWindow) {
  return window === "month" ? sql`interval '1 month'` : sql`make_interval(secs => ${window})`;
}

/**
 * Занять слот в корзине. Возвращает ok=false, если лимит окна исчерпан.
 * Если таблицы ещё нет (миграция не применена), не блокирует: лимит не должен ронять приложение.
 */
export async function takeSlot(db: Db | DbOrTx, userId: string, bucket: LimitBucket, max?: number): Promise<SlotResult> {
  const rule = LIMITS[bucket];
  const limit = max ?? rule.max;
  try {
    const rows = await db.execute<{ count: number; retry: number }>(sql`
      insert into rate_limits (user_id, bucket, window_start, count)
      values (${userId}, ${bucket}, ${windowStartSql(rule.window)}, 1)
      on conflict (user_id, bucket) do update set
        count = case when rate_limits.window_start = excluded.window_start then rate_limits.count + 1 else 1 end,
        window_start = excluded.window_start
      returning count,
        greatest(1, ceil(extract(epoch from (window_start + ${windowEndSql(rule.window)} - now()))))::int as retry`);
    const r = (rows as unknown as { count: number; retry: number }[])[0];
    return { ok: Number(r?.count ?? 0) <= limit, retryAfter: Number(r?.retry ?? 60) };
  } catch (e) {
    if ((e as { code?: string })?.code === "42P01" || (e as { cause?: { code?: string } })?.cause?.code === "42P01") {
      console.warn("rate_limits table is missing: limits are off until the migration is applied");
      return { ok: true, retryAfter: 0 };
    }
    throw e;
  }
}

/**
 * Перед вызовом Claude: лимит в минуту и месячный (SPEC 11). Возвращает ключ ошибки
 * common.errors.* или null, если можно звать.
 */
export async function takeLlmSlot(db: Db, userId: string): Promise<"rate_limited" | "llm_limit" | null> {
  if (!(await takeSlot(db, userId, "llm")).ok) return "rate_limited";
  if (!(await takeSlot(db, userId, "llm_month")).ok) return "llm_limit";
  return null;
}

/** Ответ 429 для API: машиночитаемый код, понятный текст и Retry-After. */
export function tooManyRequests(retryAfter: number, locale: "ru" | "en" = "ru"): Response {
  const message =
    locale === "en"
      ? `Too many requests. Try again in ${retryAfterText(retryAfter, "en")}.`
      : `Слишком много запросов. Попробуй снова через ${retryAfterText(retryAfter, "ru")}.`;
  return Response.json({ error: "rate_limited", message, retry_after: retryAfter }, { status: 429, headers: { "retry-after": String(retryAfter) } });
}

/** «45 сек», «3 мин», «2 ч», «5 дн» */
export function retryAfterText(sec: number, locale: "ru" | "en"): string {
  const units: [number, string, string][] = [
    [86400, "дн", "d"],
    [3600, "ч", "h"],
    [60, "мин", "min"],
    [1, "сек", "s"],
  ];
  const [size, ru, en] = units.find(([u]) => sec >= u) ?? units[3];
  const n = Math.ceil(sec / size);
  return `${n} ${locale === "en" ? en : ru}`;
}

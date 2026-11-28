import { describe, expect, it } from "vitest";
import { LIMITS, retryAfterText, tooManyRequests } from "./rate-limit";

describe("лимиты запросов", () => {
  it("правила: MCP 60/мин, часы 30/мин, Claude 10/мин и месячный, экспорт 5 за 10 мин", () => {
    expect(LIMITS.mcp).toEqual({ max: 60, window: 60 });
    expect(LIMITS.ingest).toEqual({ max: 30, window: 60 });
    expect(LIMITS.llm).toEqual({ max: 10, window: 60 });
    expect(LIMITS.llm_month.window).toBe("month");
    expect(LIMITS.export).toEqual({ max: 5, window: 600 });
  });

  it("через сколько можно снова — по-человечески", () => {
    expect(retryAfterText(45, "ru")).toBe("45 сек");
    expect(retryAfterText(61, "ru")).toBe("2 мин");
    expect(retryAfterText(7200, "en")).toBe("2 h");
    expect(retryAfterText(3 * 86400, "ru")).toBe("3 дн");
  });

  it("ответ 429: код, текст и Retry-After", async () => {
    const res = tooManyRequests(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(await res.json()).toMatchObject({ error: "rate_limited", retry_after: 42, message: expect.stringContaining("42 сек") });
  });
});

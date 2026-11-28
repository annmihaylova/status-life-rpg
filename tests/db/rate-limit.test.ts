/**
 * Лимиты запросов (фаза 5b): корзины независимы, окно сбрасывается, лимит Claude в минуту
 * и месячный, приём данных с часов отвечает 429.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/client";
import { generateToken, hashToken } from "@/lib/server/mcp/tokens";
import { handleIngest } from "@/lib/server/devices";
import { LIMITS, takeLlmSlot, takeSlot } from "@/lib/server/rate-limit";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, close } = createDb(url, 3);
const sql = (db as unknown as { $client: import("postgres").Sql }).$client;

const users: string[] = [];
async function user(): Promise<string> {
  const id = randomUUID();
  users.push(id);
  await sql`insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${`${id}@rate.test`}, '{}', '{}', now(), now())`;
  return id;
}

beforeAll(async () => {
  await sql`select 1`;
});

afterAll(async () => {
  if (users.length) await sql`delete from auth.users where id in ${sql(users)}`;
  await close();
});

describe("лимиты запросов", () => {
  it("корзины считаются отдельно, сверх лимита — отказ с Retry-After", async () => {
    const U = await user();
    const mcp = [];
    for (let i = 0; i < 4; i++) mcp.push(await takeSlot(db, U, "mcp", 3));
    expect(mcp.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(mcp[3].retryAfter).toBeGreaterThan(0);
    expect(mcp[3].retryAfter).toBeLessThanOrEqual(60);
    // другая корзина того же пользователя не тронута
    expect((await takeSlot(db, U, "ingest", 3)).ok).toBe(true);
  });

  it("новое окно начинает счёт заново", async () => {
    const U = await user();
    for (let i = 0; i < 3; i++) await takeSlot(db, U, "game", 2);
    expect((await takeSlot(db, U, "game", 2)).ok).toBe(false);
    await sql`update rate_limits set window_start = window_start - interval '5 minutes' where user_id = ${U}`;
    expect((await takeSlot(db, U, "game", 2)).ok).toBe(true);
  });

  it("Claude: 10 в минуту, потом месячный лимит", async () => {
    const U = await user();
    for (let i = 0; i < LIMITS.llm.max; i++) expect(await takeLlmSlot(db, U)).toBeNull();
    expect(await takeLlmSlot(db, U)).toBe("rate_limited");

    // минута прошла, но месяц исчерпан
    await sql`update rate_limits set window_start = window_start - interval '5 minutes' where user_id = ${U} and bucket = 'llm'`;
    await sql`update rate_limits set count = ${LIMITS.llm_month.max} where user_id = ${U} and bucket = 'llm_month'`;
    expect(await takeLlmSlot(db, U)).toBe("llm_limit");
    const [m] = await sql`select window_start from rate_limits where user_id = ${U} and bucket = 'llm_month'`;
    expect(new Date(m.window_start).getUTCDate()).toBe(1);
  });

  it("приём данных с часов: 429 с понятным текстом", async () => {
    const U = await user();
    const token = generateToken();
    await sql`insert into api_tokens (user_id, token_hash, label) values (${U}, ${hashToken(token)}, 'iPhone')`;
    await sql`insert into rate_limits (user_id, bucket, window_start, count)
              values (${U}, 'ingest', to_timestamp(floor(extract(epoch from now()) / 60) * 60), ${LIMITS.ingest.max})`;
    const res = await handleIngest(
      db,
      new Request("http://localhost/api/ingest", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ type: "walking", steps: 1000 }),
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await res.json()).toMatchObject({ error: "rate_limited", message: expect.stringContaining("Слишком много") });
  });
});

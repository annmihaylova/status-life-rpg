/**
 * Данные с часов и телефона (фаза 3d): /api/ingest с личным токеном.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/client";
import { localDate } from "@/lib/game/dates";
import { handleIngest } from "@/lib/server/devices";
import { generateToken, hashToken } from "@/lib/server/mcp/tokens";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, close } = createDb(url, 2);
const sql = (db as unknown as { $client: import("postgres").Sql }).$client;

const U = randomUUID();
let token = "";
let runId = "";
const TODAY = localDate(new Date(), "UTC");

async function post(body: unknown, tok: string | null = token) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (tok) headers.authorization = `Bearer ${tok}`;
  const res = await handleIngest(db, new Request("http://localhost/api/ingest", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await sql`insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            values (${U}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${`${U}@ingest.test`}, '{}', '{}', now(), now())`;
  await sql`update profiles set timezone = 'UTC' where id = ${U}`;
  [{ id: runId }] = await sql`insert into skills (user_id, name, primary_attr_key, secondary_attr_key, slot, domain)
                              values (${U}, 'Бег', 'endurance', 'strength', 'main', 'body') returning id`;
  await sql`insert into game_decisions (user_id, kind, payload) values (${U}, 'take_skill', ${JSON.stringify({ skillId: runId, slot: "main" })}::jsonb)`;
  token = generateToken();
  await sql`insert into api_tokens (user_id, token_hash, label) values (${U}, ${hashToken(token)}, 'Команды iPhone')`;
});

afterAll(async () => {
  await sql`delete from auth.users where id = ${U}`;
  await close();
});

describe("/api/ingest", () => {
  it("без токена — 401, мусор — 400", async () => {
    expect((await post({ type: "sleep", hours: 7 }, null)).status).toBe(401);
    expect((await post({ type: "nope" })).status).toBe(400);
  });

  it("сон попадает в самочувствие дня и пересчитывает HP", async () => {
    const r = await post({ type: "sleep", hours: 5 });
    expect(r.status).toBe(200);
    const [h] = await sql`select sleep_hours, effects from hp_days where user_id = ${U} and date = ${TODAY}`;
    expect(h.sleep_hours).toBe(5);
    expect(h.effects).toContain("lack_of_sleep");
  });

  it("тренировка — черновик с часов в навык «Бег»; повтор не создаёт дубль", async () => {
    const w = { type: "workout", kind: "Running", minutes: 30, started_at: `${TODAY}T07:00:00Z` };
    const a = await post(w);
    expect(a.body.entries[0].status).toBe("created");
    const b = await post(w);
    expect(b.body.entries[0].status).toBe("duplicate");
    const rows = await sql`select e.source, e.status, a.skill_id from activity_entries e
                           join entry_skill_allocations a on a.entry_id = e.id where e.user_id = ${U} and e.description = 'Бег'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "device", status: "draft", skill_id: runId });
  });

  it("ходьба по шагам без навыка становится кандидатом", async () => {
    const r = await post({ items: [{ type: "walking", steps: 6000 }] });
    expect(r.body.entries[0].status).toBe("created");
    const [c] = await sql`select suggested_name from skill_candidates where user_id = ${U} and suggested_name = 'Ходьба'`;
    expect(c).toBeTruthy();
  });
});

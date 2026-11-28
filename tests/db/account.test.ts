/**
 * Экспорт и удаление аккаунта (SPEC 11, фаза 5a): экспорт отдаёт только свои строки и без секретов,
 * удаление стирает все строки пользователя и не трогает чужие, каждая таблица с user_id учтена.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USER_TABLES } from "@/lib/account/export";
import { createDb } from "@/lib/db/client";
import { collectUserData, deleteUserAccount, isDeleteConfirmed } from "@/lib/server/account";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, close } = createDb(url, 3);
const sql = (db as unknown as { $client: import("postgres").Sql }).$client;

const A = randomUUID();
const B = randomUUID();
/** служебные таблицы без пользовательского содержимого */
const SYSTEM = new Set(["mcp_rate"]);

async function seed(id: string, label: string) {
  await sql`insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${`${id}@account.test`}, '{}', '{}', now(), now())`;
  const [skill] = await sql`insert into skills (user_id, name) values (${id}, ${`Бег ${label}`}) returning id`;
  const [entry] = await sql`insert into activity_entries (user_id, date, focus_minutes, description, source, status)
                            values (${id}, '2026-11-20', 45, ${`пробежка ${label}`}, 'manual', 'confirmed') returning id`;
  await sql`insert into entry_skill_allocations (entry_id, user_id, skill_id, share) values (${entry.id}, ${id}, ${skill.id}, 1)`;
  await sql`insert into hp_days (user_id, date, hp_max, hp_morning, hp_current, sleep_hours) values (${id}, '2026-11-20', 100, 90, 90, 7.5)`;
  await sql`insert into game_decisions (user_id, kind, payload) values (${id}, 'take_skill', '{}')`;
  await sql`insert into api_tokens (user_id, token_hash, label) values (${id}, ${`hash-${id}`}, 'Claude')`;
  await sql`insert into push_subscriptions (user_id, endpoint, keys) values (${id}, ${`https://push.test/${id}`}, '{"p256dh":"x","auth":"y"}')`;
  await sql`insert into mcp_rate (user_id, window_start, count) values (${id}, now(), 1)`;
}

async function countRows(userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [table, owner] of Object.entries(USER_TABLES)) {
    const [r] = await sql`select count(*)::int as n from ${sql(table)} where ${sql(owner)} = ${userId}`;
    out[table] = r.n;
  }
  const [m] = await sql`select count(*)::int as n from mcp_rate where user_id = ${userId}`;
  out.mcp_rate = m.n;
  return out;
}

beforeAll(async () => {
  await seed(A, "A");
  await seed(B, "B");
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${A}, ${B})`;
  await close();
});

describe("экспорт и удаление аккаунта", () => {
  it("каждая таблица с user_id есть в экспорте (или служебная)", async () => {
    const rows = await sql`select distinct table_name from information_schema.columns
                           where table_schema = 'public' and column_name = 'user_id'`;
    const missing = rows.map((r) => r.table_name as string).filter((t) => !(t in USER_TABLES) && !SYSTEM.has(t));
    expect(missing).toEqual([]);
  });

  it("экспорт: только свои строки, без хэшей токенов и ключей push", async () => {
    const data = await collectUserData(db, A, `${A}@account.test`);
    expect(data.email).toBe(`${A}@account.test`);
    expect(data.tables.profiles).toHaveLength(1);
    expect(data.tables.skills.map((s) => s.name)).toEqual(["Бег A"]);
    expect(data.tables.activity_entries.map((e) => e.description)).toEqual(["пробежка A"]);
    expect(data.tables.entry_skill_allocations).toHaveLength(1);
    expect(data.tables.hp_days).toHaveLength(1);
    expect(data.tables.api_tokens[0]).not.toHaveProperty("token_hash");
    expect(data.tables.api_tokens[0].label).toBe("Claude");
    expect(data.tables.push_subscriptions[0]).not.toHaveProperty("keys");
    expect(data.tables.push_subscriptions[0]).not.toHaveProperty("endpoint");
    const all = JSON.stringify(data);
    expect(all).not.toContain(B);
    expect(all).not.toContain(`hash-${A}`);
  });

  it("подтверждение словом", () => {
    expect(isDeleteConfirmed(" Удалить ")).toBe(true);
    expect(isDeleteConfirmed("DELETE")).toBe(true);
    expect(isDeleteConfirmed("да")).toBe(false);
  });

  it("удаление стирает все строки пользователя и не трогает чужие", async () => {
    const before = await countRows(A);
    expect(before.skills).toBe(1);
    expect(before.profiles).toBe(1);

    expect(await deleteUserAccount(db, A)).toBe(true);

    const after = await countRows(A);
    expect(Object.entries(after).filter(([, n]) => n > 0)).toEqual([]);
    const [u] = await sql`select count(*)::int as n from auth.users where id = ${A}`;
    expect(u.n).toBe(0);

    const other = await countRows(B);
    expect(other.skills).toBe(1);
    expect(other.activity_entries).toBe(1);
    expect(await deleteUserAccount(db, A)).toBe(false);
  });
});

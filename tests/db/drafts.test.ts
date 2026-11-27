/**
 * Подтверждение черновиков из отчёта: обычное и со слиянием в существующую запись (SPEC 4.2, 13).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/client";
import { confirmDrafts } from "@/lib/server/game/drafts";
import { recomputeUser } from "@/lib/server/game/recompute";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, close } = createDb(url, 2);
const sql = (db as unknown as { $client: import("postgres").Sql }).$client;
const U = randomUUID();
const NOW = new Date("2026-03-02T20:00:00Z");

async function entry(status: "draft" | "confirmed", minutes: number, extra: { mergeWith?: string } = {}) {
  const id = randomUUID();
  await sql`insert into activity_entries (id, user_id, date, focus_minutes, description, source, status, merge_with)
            values (${id}, ${U}, '2026-03-02', ${minutes}, ${`запись ${minutes}`}, ${status === "draft" ? "checkin" : "mcp_claude"},
                    ${status}, ${extra.mergeWith ?? null})`;
  return id;
}

beforeAll(async () => {
  await sql`insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            values (${U}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${`${U}@drafts.test`}, '{}', '{}', now(), now())`;
  await sql`update profiles set created_at = '2026-03-01T08:00:00Z' where id = ${U}`;
});

afterAll(async () => {
  await sql`delete from auth.users where id = ${U}`;
  await close();
});

describe("черновики из отчёта", () => {
  it("черновики не дают опыта до подтверждения", async () => {
    await entry("draft", 120);
    const { result } = await recomputeUser(db, U, NOW);
    expect(result.character.totalXp).toBe(0);
  });

  it("обычный черновик подтверждается; дубль сливается в существующую запись без новой", async () => {
    const fromClaude = await entry("confirmed", 90);
    const plain = await entry("draft", 60);
    const dup = await entry("draft", 105, { mergeWith: fromClaude });

    await db.transaction((tx) => confirmDrafts(tx, U, [plain, dup]));

    const rows = await sql`select id, focus_minutes, status from activity_entries where user_id = ${U} order by focus_minutes`;
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(plain)?.status).toBe("confirmed");
    expect(byId.has(dup)).toBe(false); // черновик-дубль удалён
    expect(byId.get(fromClaude)?.focus_minutes).toBe(105); // а запись Claude обновлена

    const { result } = await recomputeUser(db, U, NOW);
    expect(result.character.totalXp).toBe(60 + 105); // первый черновик (120) так и не подтверждён
  });

  it("чужие черновики не подтверждаются", async () => {
    const other = await entry("draft", 30);
    await db.transaction((tx) => confirmDrafts(tx, randomUUID(), [other]));
    const [r] = await sql`select status from activity_entries where id = ${other}`;
    expect(r.status).toBe("draft");
  });
});

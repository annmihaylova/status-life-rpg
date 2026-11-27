/**
 * Интеграционный тест пересчёта (SPEC 13: «pnpm game:recompute пересчитывает всё из сырых записей
 * и даёт тот же результат»). Нужен локальный Supabase: `pnpm db:start`, затем `pnpm test:db`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/client";
import { TITLES } from "@/lib/game/progression";
import { recomputeUser } from "@/lib/server/game/recompute";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, close } = createDb(url, 2);
const sql = (db as unknown as { $client: import("postgres").Sql }).$client;

const NOW = new Date("2026-01-06T12:00:00Z");
const users: string[] = [];

interface SeedEntry {
  date: string;
  minutes: number;
  intensity: number;
  status: "confirmed" | "draft";
  skill: boolean;
  cluster?: string;
  hour: number;
}

const ENTRIES: SeedEntry[] = [
  { date: "2026-01-01", minutes: 120, intensity: 1, status: "confirmed", skill: true, hour: 10 },
  { date: "2026-01-01", minutes: 150, intensity: 1.3, status: "confirmed", skill: true, hour: 14 },
  { date: "2026-01-02", minutes: 90, intensity: 1, status: "confirmed", skill: false, cluster: "chess", hour: 18 },
  { date: "2026-01-03", minutes: 240, intensity: 1, status: "confirmed", skill: true, hour: 11 },
  { date: "2026-01-04", minutes: 60, intensity: 1, status: "confirmed", skill: false, cluster: "chess", hour: 19 },
  { date: "2026-01-04", minutes: 500, intensity: 1, status: "draft", skill: true, hour: 20 },
  { date: "2026-01-05", minutes: 300, intensity: 1.6, status: "confirmed", skill: true, hour: 9 },
];

async function seedUser(reverse = false): Promise<string> {
  const id = randomUUID();
  users.push(id);
  await sql`
    insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            ${`${id}@recompute.test`}, '{}', '{}', now(), now())`;
  await sql`update profiles set created_at = '2026-01-01T08:00:00Z', timezone = 'UTC' where id = ${id}`;
  const skillId = randomUUID();
  await sql`insert into skills (id, user_id, name, primary_attr_key, secondary_attr_key)
            values (${skillId}, ${id}, 'Учёба', 'intellect', 'will')`;
  await sql`insert into game_decisions (user_id, kind, payload, decided_at) values
    (${id}, 'take_skill', ${JSON.stringify({ skillId, slot: "main" })}::jsonb, '2026-01-01T09:00:00Z'),
    (${id}, 'assessment', ${JSON.stringify({ bonuses: { mind: 5, spirit: 3, body: 2 } })}::jsonb, '2026-01-01T09:01:00Z')`;
  await sql`insert into hp_days (user_id, date, hp_max, hp_morning, hp_current, sleep_hours)
            values (${id}, '2026-01-02', 0, 0, 0, 5)`;

  const list = reverse ? [...ENTRIES].reverse() : ENTRIES;
  for (const e of list) {
    const entryId = randomUUID();
    const startedAt = `${e.date}T${String(e.hour).padStart(2, "0")}:00:00Z`;
    await sql`insert into activity_entries (id, user_id, date, started_at, focus_minutes, intensity, novelty, description, source, status)
              values (${entryId}, ${id}, ${e.date}, ${startedAt}, ${e.minutes}, ${e.intensity}, 1, 'тест', 'manual', ${e.status})`;
    await sql`insert into entry_skill_allocations (entry_id, user_id, skill_id, activity_cluster, share)
              values (${entryId}, ${id}, ${e.skill ? skillId : null}, ${e.cluster ?? null}, 1)`;
  }
  return id;
}

async function snapshot(userId: string) {
  const [character] = await sql`select level_cache, total_xp_cache from characters where user_id = ${userId}`;
  const skills = await sql`select xp_cache, level_cache, status, slot from skills where user_id = ${userId}`;
  const attrs = await sql`select attribute_key, value, xp_pool, xp_total, active_days_total, state
                          from user_attributes where user_id = ${userId} order by attribute_key`;
  const tags = await sql`select general_key, part_key, xp from attribute_xp_tags where user_id = ${userId} order by 1, 2`;
  const cands = await sql`select cluster_key, xp_pool, minutes_total, days_seen, offer_status
                          from skill_candidates where user_id = ${userId}`;
  const hp = await sql`select date, hp_max, hp_morning, hp_current, effects, sleep_hours
                       from hp_days where user_id = ${userId} order by date`;
  const ledger = await sql`select target_type, round(sum(amount)::numeric, 6) as total, count(*)::int as n
                           from xp_events where user_id = ${userId} group by target_type order by target_type`;
  return JSON.parse(JSON.stringify({ character, skills, attrs, tags, cands, hp, ledger }));
}

let A: string;
let B: string;

beforeAll(async () => {
  A = await seedUser();
  B = await seedUser(true);
});

afterAll(async () => {
  if (users.length) await sql`delete from auth.users where id in ${sql(users)}`;
  await close();
});

describe("game:recompute", () => {
  it("пишет кэши и леджер, совпадающие с результатом движка", async () => {
    const { result } = await recomputeUser(db, A, NOW);
    const s = await snapshot(A);

    expect(s.character.level_cache).toBe(result.character.level);
    expect(s.character.total_xp_cache).toBeCloseTo(result.character.totalXp, 6);
    // черновик не учитывается: 120 + 150×1.3 + 90 + 240 + 60 + 300×1.6
    expect(result.character.totalXp).toBeCloseTo(120 + 195 + 90 + 240 + 60 + 480, 6);

    const charLedger = s.ledger.find((l: { target_type: string }) => l.target_type === "character");
    expect(Number(charLedger.total)).toBeCloseTo(result.character.totalXp, 4);

    const [skill] = s.skills;
    expect(skill.xp_cache).toBeGreaterThan(0);
    expect(skill.status).toBe("active");

    const mind = s.attrs.find((a: { attribute_key: string }) => a.attribute_key === "mind");
    expect(mind.value).toBeGreaterThanOrEqual(15); // оценка 10 + 5
    expect(mind.active_days_total).toBe(3); // учёба 1, 3 и 5 января; шахматы без тегов в Разум не идут

    const chess = s.cands.find((c: { cluster_key: string }) => c.cluster_key === "chess");
    expect(chess).toMatchObject({ minutes_total: 150, days_seen: 2, offer_status: "offered" });

    const day2 = s.hp.find((h: { date: string }) => h.date === "2026-01-02");
    expect(day2.sleep_hours).toBe(5); // вход не затёрт
    expect(day2.hp_morning).toBe(Math.round(day2.hp_max * 0.6));
    expect(day2.effects).toContain("lack_of_sleep");
  });

  it("повторный пересчёт даёт тот же результат", async () => {
    const first = await snapshot(A);
    await recomputeUser(db, A, NOW);
    expect(await snapshot(A)).toEqual(first);
  });

  it("порядок вставки строк в БД не влияет на результат", async () => {
    await recomputeUser(db, B, NOW);
    const a = await snapshot(A);
    const b = await snapshot(B);
    expect(b.character).toEqual(a.character);
    expect(b.attrs).toEqual(a.attrs);
    expect(b.tags).toEqual(a.tags);
    expect(b.cands).toEqual(a.cands);
    expect(b.ledger).toEqual(a.ledger);
    expect(b.hp.map((h: { hp_current: number }) => h.hp_current)).toEqual(
      a.hp.map((h: { hp_current: number }) => h.hp_current),
    );
  });

  it("CLI-пересчёт по одному пользователю проходит проверку --verify", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/game-recompute.ts", "--user", A, "--verify"],
      { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" },
    );
    expect(out).toContain("повтор совпал");
  });
});

describe("титулы в БД", () => {
  it("справочник titles содержит все титулы из конфига", async () => {
    const rows = await sql`select key from titles`;
    const keys = new Set(rows.map((r) => r.key));
    for (const t of TITLES) expect(keys.has(t.key), t.key).toBe(true);
  });

  it("пересчёт пишет полученные титулы; удалённая запись забирает титул и снимает его с персонажа", async () => {
    await recomputeUser(db, A, NOW);
    const earned = await sql`select title_key from user_titles where user_id = ${A}`;
    expect(earned.map((r) => r.title_key)).toContain("first_blood");

    // временный пользователь с одной записью
    const U = randomUUID();
    users.push(U);
    await sql`insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
              values (${U}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${`${U}@titles.test`}, '{}', '{}', now(), now())`;
    await sql`update profiles set created_at = '2026-01-01T08:00:00Z', timezone = 'UTC' where id = ${U}`;
    const [{ id: entryId }] = await sql`insert into activity_entries (user_id, date, focus_minutes, description, source, status)
                                        values (${U}, '2026-01-02', 30, 'тест', 'manual', 'confirmed') returning id`;
    await recomputeUser(db, U, NOW);
    await sql`update characters set title_key = 'first_blood' where user_id = ${U}`;
    expect((await sql`select 1 from user_titles where user_id = ${U} and title_key = 'first_blood'`).length).toBe(1);

    await sql`delete from activity_entries where id = ${entryId}`;
    await recomputeUser(db, U, NOW);
    expect(await sql`select 1 from user_titles where user_id = ${U}`).toHaveLength(0);
    const [c] = await sql`select title_key from characters where user_id = ${U}`;
    expect(c.title_key).toBeNull();
  });
});

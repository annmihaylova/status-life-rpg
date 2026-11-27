/**
 * Напоминания о вечернем отчёте (фаза 3b): одноразовые токены планировщика,
 * ключи VAPID, выбор тех, кому пора, и защита от повторов.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/client";
import { consumeCronToken, getVapidKeys, runCheckinReminders } from "@/lib/server/push";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, close } = createDb(url, 2);
const sql = (db as unknown as { $client: import("postgres").Sql }).$client;

const U = randomUUID();
// Торонто зимой UTC−5: 21:05 местного 26 ноября
const NOW = new Date("2026-11-27T02:05:00Z");

beforeAll(async () => {
  await sql`insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            values (${U}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${`${U}@remind.test`}, '{}', '{}', now(), now())`;
  await sql`update profiles set timezone = 'America/Toronto' where id = ${U}`;
  await sql`update notification_settings set checkin_local_time = '21:00', enabled = true, last_sent_on = null where user_id = ${U}`;
  // адрес, который не ответит: отправка считается неудачной, но подписка не удаляется
  await sql`insert into push_subscriptions (user_id, endpoint, keys)
            values (${U}, ${`https://127.0.0.1:1/push/${U}`}, ${JSON.stringify({ p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" })}::jsonb)`;
});

afterAll(async () => {
  await sql`delete from auth.users where id = ${U}`;
  await close();
});

describe("планировщик", () => {
  it("trigger_cron кладёт одноразовый токен; anon и authenticated вызвать её не могут", async () => {
    for (const role of ["anon", "authenticated"]) {
      const [r] = await sql`select has_function_privilege(${role}, 'public.trigger_cron(text)', 'EXECUTE') as ok`;
      expect(r.ok, role).toBe(false);
    }
    const before = await sql`select count(*)::int as n from cron_tokens`;
    await sql`select public.trigger_cron('http://127.0.0.1:1/api/cron/checkins')`;
    const [{ token }] = await sql`select token from cron_tokens order by created_at desc limit 1`;
    expect((await sql`select count(*)::int as n from cron_tokens`)[0].n).toBe(before[0].n + 1);

    expect(await consumeCronToken(db, token)).toBe(true);
    expect(await consumeCronToken(db, token)).toBe(false); // одноразовый
    expect(await consumeCronToken(db, "f".repeat(64))).toBe(false);
    expect(await consumeCronToken(db, null)).toBe(false);
  });

  it("старый токен не принимается", async () => {
    const t = "a".repeat(64);
    await sql`insert into cron_tokens (token, created_at) values (${t}, now() - interval '20 minutes')`;
    expect(await consumeCronToken(db, t)).toBe(false);
    await sql`delete from cron_tokens where token = ${t}`;
  });
});

describe("VAPID", () => {
  it("ключи создаются один раз и потом не меняются", async () => {
    const a = await getVapidKeys(db);
    expect(a.publicKey.length).toBeGreaterThan(40);
    const [row] = await sql`select value from app_secrets where key = 'vapid_public'`;
    expect(row.value).toBe(a.publicKey);
  });
});

describe("напоминания", () => {
  it("в окне после выбранного времени — одно напоминание на день", async () => {
    const first = await runCheckinReminders(db, NOW);
    expect(first.due).toBeGreaterThanOrEqual(1);
    const [n] = await sql`select last_sent_on from notification_settings where user_id = ${U}`;
    expect(String(n.last_sent_on)).toBe("2026-11-26");
    // подписка с недоступным адресом: ошибка сети, но не 404/410 — подписку не удаляем
    expect(await sql`select 1 from push_subscriptions where user_id = ${U}`).toHaveLength(1);

    const again = await runCheckinReminders(db, new Date(NOW.getTime() + 15 * 60_000));
    const mine = await sql`select last_sent_on from notification_settings where user_id = ${U}`;
    expect(String(mine[0].last_sent_on)).toBe("2026-11-26");
    expect(again.due).toBe(first.due - 1);
  });

  it("если отчёт за день уже есть — не напоминаем", async () => {
    await sql`update notification_settings set last_sent_on = null where user_id = ${U}`;
    await sql`insert into checkins (user_id, date, transcript) values (${U}, '2026-11-26', 'день')`;
    const r = await runCheckinReminders(db, NOW);
    expect(r.skippedReported).toBeGreaterThanOrEqual(1);
  });

  it("выключенные напоминания не отправляются", async () => {
    await sql`update notification_settings set enabled = false, last_sent_on = null where user_id = ${U}`;
    const before = await sql`select last_sent_on from notification_settings where user_id = ${U}`;
    await runCheckinReminders(db, NOW);
    const after = await sql`select last_sent_on from notification_settings where user_id = ${U}`;
    expect(after[0].last_sent_on).toEqual(before[0].last_sent_on);
  });
});

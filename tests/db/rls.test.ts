/**
 * Тест Row Level Security на каждой таблице (SPEC 11).
 * Нужен локальный Supabase: `pnpm db:start`, затем `pnpm test:db`.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(url, { prepare: false, max: 2, onnotice: () => {} });

const A = randomUUID();
const B = randomUUID();
const TITLE = `rls_test_${A.slice(0, 8)}`;

/** Колонка владельца для каждой пользовательской таблицы. */
const OWNER_COL: Record<string, string> = {
  profiles: "id",
  user_settings: "user_id",
  onboarding_profiles: "user_id",
  characters: "user_id",
  user_titles: "user_id",
  user_attributes: "user_id",
  attribute_xp_tags: "user_id",
  calibrations: "user_id",
  attribute_assessment: "user_id",
  skills: "user_id",
  skill_specializations: "user_id",
  skill_candidates: "user_id",
  checkins: "user_id",
  activity_entries: "user_id",
  entry_skill_allocations: "user_id",
  game_decisions: "user_id",
  xp_events: "user_id",
  hp_days: "user_id",
  notification_settings: "user_id",
  push_subscriptions: "user_id",
  api_tokens: "user_id",
  weekly_chronicles: "user_id",
  skill_measurements: "user_id",
};
const READ_ONLY = new Set(["xp_events", "user_titles", "api_tokens"]);
const REFERENCE = new Set(["attributes", "titles"]);
/** служебные таблицы: RLS без политик и без прав для anon/authenticated */
const SYSTEM = new Set(["rate_limits", "app_secrets", "cron_tokens"]);

class Rollback extends Error {}

/** Выполняет fn под ролью пользователя и откатывает транзакцию. */
async function asRole<T>(
  role: "authenticated" | "anon",
  userId: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  try {
    await sql.begin(async (tx) => {
      if (userId) {
        const claims = JSON.stringify({ sub: userId, role });
        await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      }
      await tx.unsafe(`set local role ${role}`);
      result = await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return result as T;
}

/** Количество строк, затронутых запросом, или "denied", если у роли нет прав на операцию. */
async function rowsOrDenied(
  role: "authenticated" | "anon",
  userId: string | null,
  query: string,
  params: string[] = [],
): Promise<number | "denied"> {
  try {
    const r = await asRole(role, userId, (tx) => tx.unsafe(query, params));
    return r.count;
  } catch (e) {
    if (e instanceof Error && /permission denied/.test(e.message)) return "denied";
    throw e;
  }
}

async function createUser(id: string) {
  await sql`
    insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            ${`${id}@rls.test`}, '{}', '{}', now(), now())`;
}

async function seedUser(u: string) {
  const skillId = randomUUID();
  const entryId = randomUUID();
  await sql`insert into onboarding_profiles (user_id) values (${u})`;
  await sql`insert into user_titles (user_id, title_key) values (${u}, ${TITLE})`;
  await sql`insert into attribute_xp_tags (user_id, general_key, part_key, xp) values (${u}, 'mind', 'intellect', 10)`;
  await sql`insert into calibrations (user_id, kind, points_total, expires_at) values (${u}, 'start', 5, now() + interval '7 days')`;
  await sql`insert into attribute_assessment (user_id, values, explanations) values (${u}, '{}', '{}')`;
  await sql`insert into skills (id, user_id, name) values (${skillId}, ${u}, 'Книжный червь')`;
  await sql`insert into skill_measurements (user_id, skill_id, scale, value_num, value_text, measured_on) values (${u}, ${skillId}, 'elo', 1400, '1400', current_date)`;
  await sql`insert into skill_specializations (skill_id, user_id, milestone_level, name) values (${skillId}, ${u}, 10, 'Научные статьи')`;
  await sql`insert into skill_candidates (user_id, cluster_key) values (${u}, 'chess')`;
  await sql`insert into checkins (user_id, date, transcript) values (${u}, current_date, 'день')`;
  await sql`insert into activity_entries (id, user_id, date, focus_minutes, description, source) values (${entryId}, ${u}, current_date, 60, 'чтение', 'manual')`;
  await sql`insert into entry_skill_allocations (entry_id, user_id, skill_id, share) values (${entryId}, ${u}, ${skillId}, 1)`;
  await sql`insert into game_decisions (user_id, kind) values (${u}, 'assessment')`;
  await sql`insert into xp_events (user_id, entry_id, target_type, target_id, amount, formula_version) values (${u}, ${entryId}, 'character', ${u}, 60, 1)`;
  await sql`insert into hp_days (user_id, date, hp_max, hp_morning, hp_current) values (${u}, current_date, 100, 90, 90)`;
  await sql`insert into push_subscriptions (user_id, endpoint, keys) values (${u}, ${`https://push.test/${u}`}, '{}')`;
  await sql`insert into api_tokens (user_id, token_hash, label) values (${u}, ${`hash-${u}`}, 'test')`;
  await sql`insert into weekly_chronicles (user_id, week_start, stats) values (${u}, current_date, '{}')`;
}

beforeAll(async () => {
  await sql`insert into titles (key, name_ru, name_en, rule) values (${TITLE}, 'Тест', 'Test', '{}')`;
  await createUser(A);
  await createUser(B);
  await seedUser(A);
  await seedUser(B);
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${A}, ${B})`;
  await sql`delete from titles where key = ${TITLE}`;
  await sql.end();
});

describe("RLS", () => {
  it("включена на каждой таблице public, и каждая таблица учтена в тесте", async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows.length).toBe(Object.keys(OWNER_COL).length + REFERENCE.size + SYSTEM.size);
    for (const r of rows) {
      expect(r.relrowsecurity, `RLS выключена: ${r.relname}`).toBe(true);
      expect(
        r.relname in OWNER_COL || REFERENCE.has(r.relname) || SYSTEM.has(r.relname),
        `таблица не покрыта тестом: ${r.relname}`,
      ).toBe(true);
    }
  });

  it("триггер создаёт стартовые строки нового пользователя", async () => {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from user_attributes where user_id = ${A}`;
    expect(n).toBe(3);
    const [p] = await sql`select locale from profiles where id = ${A}`;
    expect(p.locale).toBe("ru");
  });

  for (const [table, col] of Object.entries(OWNER_COL)) {
    describe(table, () => {
      it("владелец видит свои строки, чужой — нет", async () => {
        const q = `select count(*)::int as n from ${table} where ${col} = $1`;
        const own = await asRole("authenticated", A, (tx) => tx.unsafe(q, [A]));
        expect(own[0].n).toBeGreaterThan(0);
        const foreign = await asRole("authenticated", B, (tx) => tx.unsafe(q, [A]));
        expect(foreign[0].n).toBe(0);
      });

      it("у анонима нет доступа", async () => {
        expect(await rowsOrDenied("anon", null, `select 1 from ${table}`)).toBe("denied");
      });

      it("чужие строки нельзя изменить или удалить", async () => {
        const upd = await rowsOrDenied(
          "authenticated",
          B,
          `update ${table} set ${col} = ${col} where ${col} = $1`,
          [A],
        );
        expect([0, "denied"]).toContain(upd);
        const del = await rowsOrDenied("authenticated", B, `delete from ${table} where ${col} = $1`, [
          A,
        ]);
        expect([0, "denied"]).toContain(del);
      });

      if (READ_ONLY.has(table)) {
        it("только чтение: свои строки нельзя ни менять, ни удалять", async () => {
          const q = `delete from ${table} where ${col} = $1`;
          expect(await rowsOrDenied("authenticated", A, q, [A])).toBe("denied");
          const u = `update ${table} set ${col} = ${col} where ${col} = $1`;
          expect(await rowsOrDenied("authenticated", A, u, [A])).toBe("denied");
        });
      } else {
        it("права: authenticated может читать и писать, RLS ограничивает строки", async () => {
          const [r] = await sql<{ ok: boolean }[]>`
            select has_table_privilege('authenticated', ${"public." + table}, 'SELECT, INSERT, UPDATE, DELETE') as ok`;
          expect(r.ok).toBe(true);
        });
      }
    });
  }

  it("нельзя вставить строку от имени другого пользователя", async () => {
    await expect(
      asRole("authenticated", B, (tx) => tx`insert into skills (user_id, name) values (${A}, 'x')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("свой XP в леджер вписать нельзя", async () => {
    await expect(
      asRole(
        "authenticated",
        A,
        (tx) => tx`insert into xp_events (user_id, target_type, target_id, amount, formula_version)
                   values (${A}, 'character', ${A}, 999999, 1)`,
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
  });

  it("свою запись создать можно", async () => {
    const r = await asRole(
      "authenticated",
      A,
      (tx) => tx`insert into skills (user_id, name) values (${A}, 'Шахматы') returning id`,
    );
    expect(r).toHaveLength(1);
  });

  it("служебные таблицы закрыты для anon и authenticated", async () => {
    for (const t of SYSTEM) {
      for (const role of ["anon", "authenticated"]) {
        const [r] = await sql`select has_table_privilege(${role}, ${"public." + t}, 'SELECT, INSERT, UPDATE, DELETE') as ok`;
        expect(r.ok, `${role} → ${t}`).toBe(false);
      }
    }
  });

  it("хранилище своих 3D-моделей: только своя папка", async () => {
    const mine = `${A}/rls-test.vrm`;
    const ins = (uid: string, name: string) =>
      asRole("authenticated", uid, (tx) => tx`insert into storage.objects (bucket_id, name) values ('vrm-user', ${name}) returning id`);
    await expect(ins(B, mine)).rejects.toThrow(/row-level security|permission denied/);
    expect(await ins(A, mine)).toHaveLength(1);
    // чтение: в одной транзакции (с откатом) кладём файл от имени A и смотрим глазами B и A
    const claims = (uid: string) => JSON.stringify({ sub: uid, role: "authenticated" });
    const seen = await asRole("authenticated", A, async (tx) => {
      await tx`insert into storage.objects (bucket_id, name) values ('vrm-user', ${mine})`;
      await tx`select set_config('request.jwt.claims', ${claims(B)}, true)`;
      const byB = await tx`select 1 from storage.objects where bucket_id = 'vrm-user' and name = ${mine}`;
      await tx`select set_config('request.jwt.claims', ${claims(A)}, true)`;
      const byA = await tx`select 1 from storage.objects where bucket_id = 'vrm-user' and name = ${mine}`;
      return { byB: byB.length, byA: byA.length };
    });
    expect(seen).toEqual({ byB: 0, byA: 1 });
    const [bucket] = await sql`select public, file_size_limit from storage.buckets where id = 'vrm-user'`;
    expect(bucket.public).toBe(false);
    expect(Number(bucket.file_size_limit)).toBe(31457280);
  });

  it("справочники читаются всеми", async () => {
    const r = await asRole("anon", null, (tx) => tx`select count(*)::int as n from attributes`);
    expect(r[0].n).toBe(12);
  });

  it("удаление пользователя удаляет все его данные", async () => {
    const tmp = randomUUID();
    await createUser(tmp);
    await seedUser(tmp);
    await sql`delete from auth.users where id = ${tmp}`;
    for (const [table, col] of Object.entries(OWNER_COL)) {
      const r = await sql.unsafe(`select count(*)::int as n from ${table} where ${col} = $1`, [tmp]);
      expect(r[0].n, table).toBe(0);
    }
  });
});

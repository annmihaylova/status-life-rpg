/**
 * Создание подключения к БД без привязки к Next.js — используется и сервером (lib/db/index.ts),
 * и CLI-скриптами (pnpm game:recompute), и интеграционными тестами.
 */
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Db или транзакция — для функций, которым всё равно. */
export type DbOrTx = Db | Tx;

export function createDb(url: string, max = 5): { db: Db; close: () => Promise<void> } {
  // prepare: false — совместимо с пулером Supabase (transaction mode)
  const client = postgres(url, { prepare: false, max, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

/**
 * Запросы от имени пользователя: транзакция с ролью `authenticated` и JWT-claims,
 * поэтому RLS действует и на сервере (PLAN 2, п. 7).
 */
export async function withUserTx<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

export { schema };

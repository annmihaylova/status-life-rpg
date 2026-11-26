import "server-only";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env.server";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let _db: Db | undefined;

/**
 * Привилегированное подключение (роль postgres, RLS не действует).
 * Только для игрового движка и системных задач, которые сами ограничивают запросы по userId.
 */
export function adminDb(): Db {
  if (!_db) {
    // prepare: false — совместимо с пулером Supabase (transaction mode)
    const client = postgres(serverEnv().DATABASE_URL, { prepare: false, max: 5 });
    _db = drizzle(client, { schema });
  }
  return _db;
}

/**
 * Запросы от имени пользователя: транзакция с ролью `authenticated` и JWT-claims,
 * поэтому RLS действует и на сервере (PLAN 2, п. 7).
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return adminDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

export { schema };

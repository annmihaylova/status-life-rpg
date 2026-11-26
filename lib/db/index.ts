import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createDb, withUserTx, type Db, type Tx } from "./client";

export type { Db, DbOrTx, Tx } from "./client";
export { schema } from "./client";

let _db: Db | undefined;

/**
 * Привилегированное подключение (роль postgres, RLS не действует).
 * Только для игрового движка и системных задач, которые сами ограничивают запросы по userId.
 */
export function adminDb(): Db {
  _db ??= createDb(serverEnv().DATABASE_URL).db;
  return _db;
}

/** Запросы от имени пользователя: RLS действует и на сервере. */
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUserTx(adminDb(), userId, fn);
}

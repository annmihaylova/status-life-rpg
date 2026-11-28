/**
 * Экспорт и удаление аккаунта (SPEC 11, фаза 5a). Принимает подключение параметром —
 * так функции работают и в серверных действиях, и в интеграционных тестах.
 */
import { sql } from "drizzle-orm";
import { redact, USER_TABLES, type ExportData, type Row, type UserTable } from "@/lib/account/export";
import { withUserTx, type Db } from "@/lib/db/client";

/** Все строки пользователя из каждой его таблицы — от имени пользователя, RLS действует. */
export async function collectUserData(db: Db, userId: string, email: string | null): Promise<ExportData> {
  const tables = await withUserTx(db, userId, async (tx) => {
    const out = {} as Record<UserTable, Row[]>;
    for (const [table, owner] of Object.entries(USER_TABLES) as [UserTable, string][]) {
      const rows = await tx.execute(sql`select * from ${sql.identifier(table)} where ${sql.identifier(owner)} = ${userId}`);
      out[table] = redact(table, [...rows] as Row[]);
    }
    return out;
  });
  return { exportedAt: new Date().toISOString(), email, tables };
}

/**
 * Удаляет пользователя из auth.users; все его таблицы, токены, сессии и согласия OAuth
 * удаляются каскадом (внешние ключи on delete cascade). Возвращает, был ли пользователь.
 */
export async function deleteUserAccount(db: Db, userId: string): Promise<boolean> {
  const rows = await db.execute(sql`delete from auth.users where id = ${userId} returning id`);
  return rows.length > 0;
}

/** Слово для подтверждения удаления: на любом из языков интерфейса, регистр не важен. */
export const DELETE_CONFIRM_WORDS = ["удалить", "delete"] as const;
export function isDeleteConfirmed(input: string): boolean {
  return (DELETE_CONFIRM_WORDS as readonly string[]).includes(input.trim().toLowerCase());
}

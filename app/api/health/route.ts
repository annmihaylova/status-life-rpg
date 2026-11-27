import { sql } from "drizzle-orm";
import { adminDb } from "@/lib/db";
import { FORMULA_VERSION } from "@/lib/game/config";

/** Проверка живости: приложение и подключение к БД (без каких-либо данных пользователей). */
export async function GET() {
  let db = false;
  try {
    await adminDb().execute(sql`select 1`);
    db = true;
  } catch {
    db = false;
  }
  return Response.json({ ok: db, db, formulaVersion: FORMULA_VERSION }, { status: db ? 200 : 503 });
}

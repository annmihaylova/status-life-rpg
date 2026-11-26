import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { replay } from "@/lib/game/engine/replay";
import type { EngineResult } from "@/lib/game/engine/types";
import { loadEngineInput } from "./load";
import { persistEngineResult } from "./persist";

export interface RecomputeResult {
  result: EngineResult;
  skippedDecisions: string[];
}

/**
 * Полный пересчёт пользователя: чтение сырых данных → replay() → запись кэшей и леджера.
 * Чтение и запись — в одной транзакции, чтобы параллельный пересчёт не перемешал данные.
 */
export async function recomputeUser(db: Db, userId: string, now = new Date()): Promise<RecomputeResult> {
  return db.transaction(async (tx) => {
    // сериализуем пересчёты одного пользователя
    // advisory lock держится до конца транзакции
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const { input, skippedDecisions } = await loadEngineInput(tx, userId, now);
    const result = replay(input);
    await persistEngineResult(tx, userId, result);
    return { result, skippedDecisions };
  });
}

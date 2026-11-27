import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";

export const MCP_RATE = { perMinute: 60 };

/**
 * Фиксированное окно в минуту на пользователя (SPEC 7.5). Атомарно в Postgres,
 * поэтому работает и при нескольких serverless-инстансах.
 * Возвращает true, если вызов разрешён.
 */
export async function takeMcpSlot(db: Db, userId: string, limit = MCP_RATE.perMinute): Promise<boolean> {
  const rows = await db.execute<{ count: number }>(sql`
    insert into mcp_rate (user_id, window_start, count)
    values (${userId}, date_trunc('minute', now()), 1)
    on conflict (user_id) do update set
      count = case when mcp_rate.window_start = date_trunc('minute', now()) then mcp_rate.count + 1 else 1 end,
      window_start = date_trunc('minute', now())
    returning count`);
  const count = Number((rows as unknown as { count: number }[])[0]?.count ?? 0);
  return count <= limit;
}

import { adminDb } from "@/lib/db";
import { tokenFromHeaders } from "@/lib/server/mcp/tokens";
import { consumeCronToken, runCheckinReminders } from "@/lib/server/push";

// Напоминания о вечернем отчёте. Вызывает pg_cron в Supabase каждые 15 минут через
// public.trigger_cron(url): токен одноразовый и лежит в cron_tokens, общий секрет не нужен.
export const runtime = "nodejs";
export const maxDuration = 60;

async function handler(req: Request): Promise<Response> {
  const db = adminDb();
  if (!(await consumeCronToken(db, tokenFromHeaders(req.headers)))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await runCheckinReminders(db));
}

export { handler as GET, handler as POST };

/**
 * Скачать все свои данные одним ZIP (SPEC 11). Только для вошедшего пользователя:
 * сессия из cookie, данные читаются от его имени (RLS).
 */
import { buildExportZip, exportFileName } from "@/lib/account/export";
import { adminDb } from "@/lib/db";
import { collectUserData } from "@/lib/server/account";
import { takeSlot, tooManyRequests } from "@/lib/server/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return new Response("unauthorized", { status: 401 });
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  const slot = await takeSlot(adminDb(), userId, "export");
  if (!slot.ok) return tooManyRequests(slot.retryAfter);

  const zip = buildExportZip(await collectUserData(adminDb(), userId, email));
  return new Response(zip as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${exportFileName(new Date())}"`,
      "cache-control": "no-store",
    },
  });
}

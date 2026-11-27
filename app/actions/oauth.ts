"use server";

import { z } from "zod";
import { adminDb } from "@/lib/db";
import { grantOAuthClient } from "@/lib/server/mcp/oauth";
import { requireUserId } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Решение на странице согласия OAuth. Возвращает адрес, куда отправить браузер
 * (redirect_uri клиента с кодом или с ошибкой access_denied).
 */
export async function decideOAuth(
  authorizationId: string,
  approve: boolean,
): Promise<{ url?: string; error?: string }> {
  const userId = await requireUserId();
  const id = z.string().min(1).max(200).safeParse(authorizationId);
  if (!id.success) return { error: "oauth_failed" };
  const supabase = await createClient();

  if (!approve) {
    const { data, error } = await supabase.auth.oauth.denyAuthorization(id.data, { skipBrowserRedirect: true });
    return error || !data ? { error: "oauth_failed" } : { url: data.redirect_url };
  }

  const details = await supabase.auth.oauth.getAuthorizationDetails(id.data);
  if (details.error || !details.data) return { error: "oauth_failed" };
  if ("authorization_id" in details.data) {
    if (details.data.user.id !== userId) return { error: "oauth_failed" };
    const client = details.data.client;
    await grantOAuthClient(adminDb(), userId, client.id, client.name?.slice(0, 40) || "OAuth");
  }
  const { data, error } = await supabase.auth.oauth.approveAuthorization(id.data, { skipBrowserRedirect: true });
  return error || !data ? { error: "oauth_failed" } : { url: data.redirect_url };
}

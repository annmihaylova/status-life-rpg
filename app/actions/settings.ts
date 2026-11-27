"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { adminDb, withUser } from "@/lib/db";
import { apiTokens, profiles, userSettings } from "@/lib/db/schema";
import { LOCALE_COOKIE } from "@/i18n/config";
import { generateToken, hashToken } from "@/lib/server/mcp/tokens";
import { requireUserId } from "@/lib/server/session";

const MAX_ACTIVE_TOKENS = 10;

/**
 * Новый токен для ИИ-агента. Возвращается один раз; в БД — только хэш.
 * Пишет сервер: у роли authenticated на api_tokens только чтение.
 */
export async function createApiToken(label: string): Promise<{ token?: string; error?: string }> {
  const userId = await requireUserId();
  const l = z.string().trim().min(1).max(40).safeParse(label);
  if (!l.success) return { error: "bad_label" };
  const db = adminDb();
  const active = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
  if (active.length >= MAX_ACTIVE_TOKENS) return { error: "too_many_tokens" };
  const token = generateToken();
  await db.insert(apiTokens).values({ userId, label: l.data, tokenHash: hashToken(token) });
  revalidatePath("/settings");
  return { token };
}

export async function revokeApiToken(id: string): Promise<void> {
  const userId = await requireUserId();
  z.uuid().parse(id);
  await adminDb()
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
  revalidatePath("/settings");
}

export async function setAutoConfirmAi(value: boolean): Promise<void> {
  const userId = await requireUserId();
  await withUser(userId, (tx) =>
    tx.update(userSettings).set({ autoConfirmAi: value, updatedAt: new Date() }).where(eq(userSettings.userId, userId)),
  );
  revalidatePath("/settings");
}

export async function setLocale(locale: string): Promise<void> {
  const userId = await requireUserId();
  const l = z.enum(["ru", "en"]).parse(locale);
  await withUser(userId, (tx) => tx.update(profiles).set({ locale: l }).where(eq(profiles.id, userId)));
  (await cookies()).set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/**
 * Персональные токены MCP (SPEC 7.2): показываются один раз, в БД — только SHA-256.
 * Токен длинный и случайный (256 бит), поэтому хватает быстрого хэша без соли.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { apiTokens } from "@/lib/db/schema";

const PREFIX = "sts_";

export function generateToken(): string {
  return PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Токен из заголовков: `Authorization: Bearer …`, либо `x-api-key` / `x-auth-token`.
 * Терпим к тому, что приходит из «Команд» и ручной вставки: пробелы и кавычки по краям,
 * перенос строки, ключ `sts_…` без слова Bearer.
 */
export function tokenFromHeaders(h: Headers): string | null {
  const clean = (v: string | null) => (v ? v.trim().replace(/^["'«]+|["'»]+$/g, "").trim() : "");
  const auth = clean(h.get("authorization"));
  if (auth) {
    const m = auth.match(/^Bearer\s+(\S+)$/i);
    if (m) return m[1];
    if (/^sts_\S+$/.test(auth)) return auth;
  }
  return clean(h.get("x-api-key")) || clean(h.get("x-auth-token")) || null;
}

export interface TokenOwner {
  userId: string;
  tokenId: string;
}

export async function verifyToken(db: Db, token: string): Promise<TokenOwner | null> {
  if (!token.startsWith(PREFIX) || token.length < 30 || token.length > 100) return null;
  const [row] = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)));
  if (!row) return null;
  // отметка «последнее использование» не чаще раза в минуту
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: sql`now()` }).where(eq(apiTokens.id, row.id));
  }
  return { userId: row.userId, tokenId: row.id };
}

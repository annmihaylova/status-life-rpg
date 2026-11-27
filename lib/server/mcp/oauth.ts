/**
 * OAuth 2.1 для MCP-коннектора: сервер авторизации — Supabase Auth (OAuth Server, бета),
 * Status — защищённый ресурс. Claude находит сервер авторизации через
 * `/.well-known/oauth-protected-resource` (RFC 9728), регистрируется сам (DCR),
 * пользователь соглашается на `/oauth/consent`, и в MCP приходит access token Supabase (JWT).
 *
 * Каждому OAuth-клиенту пользователя соответствует строка в `api_tokens`
 * (token_hash = `oauth:<user>:<client>`, это не может совпасть с SHA-256 настоящего токена):
 * так записи агента помечаются его id, а в Настройках клиента можно отозвать.
 */
import { and, eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { apiTokens } from "@/lib/db/schema";

export interface OAuthConfig {
  issuer: string;
  jwks: JWTVerifyGetKey;
}

let remote: OAuthConfig | null = null;

/** Сервер авторизации проекта: `<SUPABASE_URL>/auth/v1`. */
export function authIssuer(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return `${url.replace(/\/$/, "")}/auth/v1`;
}

export function defaultOAuthConfig(): OAuthConfig {
  if (!remote) {
    const issuer = authIssuer();
    remote = { issuer, jwks: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) };
  }
  return remote;
}

/** Метаданные защищённого ресурса (RFC 9728). `resource` должен совпадать с адресом MCP. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [authIssuer()],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "email", "profile"],
    resource_name: "Status",
  };
}

export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/api/mcp`;
}

const claimsSchema = z.object({
  sub: z.uuid(),
  client_id: z.string().min(1).max(200),
});

export function looksLikeJwt(token: string): boolean {
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token);
}

/**
 * Проверяет access token, выданный OAuth-сервером Supabase: подпись (JWKS), issuer, срок.
 * Обычные сессионные JWT сайта без `client_id` не принимаются: в MCP только явно разрешённые клиенты.
 */
export async function verifyOAuthToken(
  token: string,
  cfg: OAuthConfig,
): Promise<{ userId: string; clientId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, cfg.jwks, { issuer: cfg.issuer, algorithms: ["ES256", "RS256"] });
    const c = claimsSchema.safeParse(payload);
    if (!c.success) return null;
    return { userId: c.data.sub, clientId: c.data.client_id };
  } catch {
    return null;
  }
}

export const oauthTokenKey = (userId: string, clientId: string) => `oauth:${userId}:${clientId}`;

/**
 * Строка «токена» для OAuth-клиента: создаётся при согласии (с именем клиента)
 * или при первом вызове. Отозванный в Настройках клиент получает 401, пока пользователь
 * снова не даст согласие.
 */
export async function oauthClientToken(
  db: Db,
  userId: string,
  clientId: string,
  label: string,
): Promise<{ tokenId: string } | null> {
  const key = oauthTokenKey(userId, clientId);
  const [row] = await db
    .select({ id: apiTokens.id, revokedAt: apiTokens.revokedAt, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, key), eq(apiTokens.userId, userId)));
  if (row) {
    if (row.revokedAt) return null;
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
      await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
    }
    return { tokenId: row.id };
  }
  const [created] = await db
    .insert(apiTokens)
    .values({ userId, tokenHash: key, label, lastUsedAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: apiTokens.id });
  if (created) return { tokenId: created.id };
  // параллельный запрос успел создать строку
  const [again] = await db.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.tokenHash, key));
  return again ? { tokenId: again.id } : null;
}

/** Согласие на странице /oauth/consent: клиент снова активен, имя — из регистрации клиента. */
export async function grantOAuthClient(db: Db, userId: string, clientId: string, label: string): Promise<void> {
  const key = oauthTokenKey(userId, clientId);
  await db
    .insert(apiTokens)
    .values({ userId, tokenHash: key, label })
    .onConflictDoUpdate({ target: apiTokens.tokenHash, set: { revokedAt: null, label } });
}

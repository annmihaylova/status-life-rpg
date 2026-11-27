export type AuthErrorLike = { code?: string; status?: number; message: string };

export type AuthErrorKey =
  | "errors.rateLimit"
  | "errors.tooOften"
  | "errors.notAuthorized"
  | "errors.invalidCode";

const BY_CODE: Record<string, AuthErrorKey> = {
  over_email_send_rate_limit: "errors.rateLimit",
  over_request_rate_limit: "errors.tooOften",
  email_address_not_authorized: "errors.notAuthorized",
  otp_expired: "errors.invalidCode",
};

/**
 * Ошибка Supabase Auth → ключ `login.errors.*` или null (тогда показываем текст как есть).
 * `over_email_send_rate_limit` приходит в двух случаях: исчерпан часовой лимит почты проекта
 * («email rate limit exceeded») и повтор на тот же адрес раньше минуты («…after N seconds»).
 */
export function authErrorKey(error: AuthErrorLike): AuthErrorKey | null {
  if (error.code === "over_email_send_rate_limit" && /after \d+ seconds?/i.test(error.message)) {
    return "errors.tooOften";
  }
  const key = error.code ? BY_CODE[error.code] : undefined;
  if (key) return key;
  if (error.status === 429) return "errors.tooOften";
  return null;
}

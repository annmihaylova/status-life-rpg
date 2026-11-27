"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import { authErrorKey, type AuthErrorLike } from "@/lib/supabase/auth-errors";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "verifying" }
  | { kind: "error"; message: string };

// Google показываем, только когда провайдер включён в Supabase (иначе кнопка ведёт на ошибку).
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
// Поле для кода показываем, только если шаблон письма содержит код ({{ .Token }}).
// Локально — да (supabase/templates/sign-in.html). В облаке шаблон меняется только со своим SMTP.
const EMAIL_CODE_ENABLED = process.env.NEXT_PUBLIC_AUTH_EMAIL_CODE === "true";

/**
 * Письмо отправляем в implicit-режиме: ссылка из письма приносит токены прямо в URL (#…),
 * и вход срабатывает в любом браузере, а не только в том, где запросили письмо (как в PKCE).
 */
function emailClient() {
  return createSupabaseJsClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export function LoginForm({ initialError, next = "/" }: { initialError: string | null; next?: string }) {
  const t = useTranslations("login");
  const authError = (error: AuthErrorLike) => {
    const key = authErrorKey(error);
    return key ? t(key) : error.message;
  };
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [state, setState] = useState<State>(
    initialError ? { kind: "error", message: initialError } : { kind: "idle" },
  );

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const { error } = await emailClient().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo:
          next === "/"
            ? `${window.location.origin}/auth/finish`
            : `${window.location.origin}/auth/finish?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setState({ kind: "error", message: authError(error) });
      return;
    }
    setCodeSent(true);
    setState({ kind: "sent" });
  }

  // Код из письма работает в любом браузере и на любом устройстве, в отличие от ссылки.
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "verifying" });
    // implicit-клиент не хранит сессию, поэтому код проверяем обычным клиентом с куками
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setState({ kind: "error", message: authError(error) });
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function google() {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) setState({ kind: "error", message: authError(error) });
  }

  const input =
    "w-full rounded-lg border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent";
  const primary =
    "w-full rounded-lg bg-accent px-3 py-2 font-medium text-black disabled:opacity-60";

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={sendLink} className="space-y-3">
        <label className="block text-sm" htmlFor="email">
          {t("email")}
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          className={input}
        />
        <button
          type="submit"
          disabled={state.kind === "sending"}
          className={codeSent ? "w-full rounded-lg border border-panel-border px-3 py-2" : primary}
        >
          {state.kind === "sending" ? t("sending") : codeSent ? t("resend") : t("sendLink")}
        </button>
      </form>

      {codeSent && EMAIL_CODE_ENABLED && (
        <form onSubmit={verifyCode} className="space-y-3">
          <label className="block text-sm" htmlFor="code">
            {t("code")}
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            minLength={6}
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className={`${input} font-mono tracking-widest`}
          />
          <button type="submit" disabled={state.kind === "verifying"} className={primary}>
            {state.kind === "verifying" ? t("verifying") : t("signIn")}
          </button>
        </form>
      )}

      {GOOGLE_ENABLED && !codeSent && (
        <>
          <div className="text-center text-xs text-muted">{t("or")}</div>
          <button
            type="button"
            onClick={google}
            className="w-full rounded-lg border border-panel-border px-3 py-2"
          >
            {t("google")}
          </button>
        </>
      )}

      <p role="status" aria-live="polite" className="min-h-5 font-mono text-sm">
        {state.kind === "sent" && (
          <span className="text-accent">{EMAIL_CODE_ENABLED ? t("sentWithCode") : t("sent")}</span>
        )}
        {state.kind === "error" && (
          <span className="text-hp">{t("error", { message: state.message })}</span>
        )}
      </p>
    </div>
  );
}

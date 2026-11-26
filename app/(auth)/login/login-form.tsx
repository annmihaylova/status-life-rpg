"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "verifying" }
  | { kind: "error"; message: string };

// Google показываем, только когда провайдер включён в Supabase (иначе кнопка ведёт на ошибку).
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";

export function LoginForm({ initialError }: { initialError: string | null }) {
  const t = useTranslations("login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [state, setState] = useState<State>(
    initialError ? { kind: "error", message: initialError } : { kind: "idle" },
  );

  const callbackUrl = () => `${window.location.origin}/auth/callback`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) {
      setState({ kind: "error", message: error.message });
      return;
    }
    setCodeSent(true);
    setState({ kind: "sent" });
  }

  // Код из письма работает в любом браузере и на любом устройстве, в отличие от ссылки.
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "verifying" });
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setState({ kind: "error", message: error.message });
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function google() {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) setState({ kind: "error", message: error.message });
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

      {codeSent && (
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
        {state.kind === "sent" && <span className="text-accent">{t("sent")}</span>}
        {state.kind === "error" && (
          <span className="text-hp">{t("error", { message: state.message })}</span>
        )}
      </p>
    </div>
  );
}

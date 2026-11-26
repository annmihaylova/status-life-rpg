"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function LoginForm() {
  const t = useTranslations("login");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const redirectTo = () => `${window.location.origin}/auth/callback`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setState(error ? { kind: "error", message: error.message } : { kind: "sent" });
  }

  async function google() {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setState({ kind: "error", message: error.message });
  }

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
          className="w-full rounded-lg border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={state.kind === "sending"}
          className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-black disabled:opacity-60"
        >
          {state.kind === "sending" ? t("sending") : t("sendLink")}
        </button>
      </form>
      <div className="text-center text-xs text-muted">{t("or")}</div>
      <button
        type="button"
        onClick={google}
        className="w-full rounded-lg border border-panel-border px-3 py-2"
      >
        {t("google")}
      </button>
      <p role="status" aria-live="polite" className="min-h-5 font-mono text-sm">
        {state.kind === "sent" && <span className="text-accent">{t("sent")}</span>}
        {state.kind === "error" && (
          <span className="text-hp">{t("error", { message: state.message })}</span>
        )}
      </p>
    </div>
  );
}

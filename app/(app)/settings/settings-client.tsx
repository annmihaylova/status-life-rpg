"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/actions/account";
import { createApiToken, revokeApiToken, setAutoConfirmAi, setLocale } from "@/app/actions/settings";
import { Button, Chip } from "@/components/ui/primitives";

export function TokenManager({
  mcpUrl,
  tokens,
}: {
  mcpUrl: string;
  tokens: { id: string; label: string; created: string; lastUsed: string | null }[];
}) {
  const t = useTranslations("settings.ai");
  const tc = useTranslations("common");
  const router = useRouter();
  const [label, setLabel] = useState("Claude");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-muted">{t("serverUrl")}</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-black/40 px-2 py-1.5 font-mono text-xs">{mcpUrl}</code>
          <Button variant="outline" onClick={() => copy(mcpUrl, "url")}>
            {copied === "url" ? t("copied") : t("copy")}
          </Button>
        </div>
      </div>

      {tokens.length > 0 && (
        <ul className="space-y-2">
          {tokens.map((tk) => (
            <li key={tk.id} className="flex items-center justify-between gap-2 rounded-xl border border-panel-border p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm">{tk.label}</span>
                <span className="block font-mono text-[10px] text-muted">
                  {t("tokenMeta", { created: tk.created, used: tk.lastUsed ?? t("never") })}
                </span>
              </span>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (confirm(t("revokeConfirm"))) start(async () => (await revokeApiToken(tk.id), router.refresh()));
                }}
              >
                {t("revoke")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm text-muted">{t("manualTitle")}</summary>
        <p className="mt-2 text-xs text-muted">{t("manualHint")}</p>
        {fresh && (
          <div className="space-y-2 rounded-xl border border-star/60 bg-star/5 p-3">
            <p className="text-sm text-star">{t("freshWarning")}</p>
            <code className="block break-all rounded bg-black/40 px-2 py-1.5 font-mono text-xs">Bearer {fresh}</code>
            <Button variant="outline" onClick={() => copy(`Bearer ${fresh}`, "token")}>
              {copied === "token" ? t("copied") : t("copyHeader")}
            </Button>
          </div>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const r = await createApiToken(label);
              if (r.error) setError(tc(`errors.${r.error}`));
              else if (r.token) {
                setFresh(r.token);
                router.refresh();
              }
            });
          }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            aria-label={t("label")}
            placeholder={t("label")}
            className="min-w-0 flex-1 rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
          />
          <Button type="submit" disabled={pending || !label.trim()}>
            {t("create")}
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-hp">
            {error}
          </p>
        )}
      </details>
    </div>
  );
}

export function AiSettings({ autoConfirm }: { autoConfirm: boolean }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Chip selected={!autoConfirm} disabled={pending} onClick={() => start(async () => (await setAutoConfirmAi(false), router.refresh()))}>
          {t("autoOff")}
        </Chip>
        <Chip selected={autoConfirm} disabled={pending} onClick={() => start(async () => (await setAutoConfirmAi(true), router.refresh()))}>
          {t("autoOn")}
        </Chip>
      </div>
      <p className="text-xs text-muted">{t("autoHint")}</p>
    </div>
  );
}

/** Мои данные: скачать архив и удалить аккаунт (SPEC 11). */
export function AccountPanel() {
  const t = useTranslations("settings.account");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="text-muted">{t("exportHint")}</p>
        {/* обычная ссылка: браузер сам скачает файл из ответа с content-disposition */}
        <a
          href="/api/export"
          download
          className="inline-flex min-h-10 items-center rounded-xl border border-panel-border px-4 hover:border-accent"
        >
          {t("export")}
        </a>
      </div>

      <div className="space-y-2 border-t border-panel-border pt-4">
        {!open ? (
          <Button variant="danger" onClick={() => setOpen(true)}>
            {t("delete")}
          </Button>
        ) : (
          <form
            className="space-y-3 rounded-xl border border-hp/50 bg-hp/5 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                setError(null);
                const r = await deleteAccount(word);
                if (r?.error) setError(tc(`errors.${r.error}`));
              });
            }}
          >
            <p>{t("deleteWarning")}</p>
            <label className="block space-y-1">
              <span className="text-xs text-muted">{t("deleteType")}</span>
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                autoComplete="off"
                className="w-full rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-hp"
              />
            </label>
            {error && (
              <p role="alert" className="text-hp">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={pending || !word.trim()}>
                {pending ? t("deleting") : t("deleteForever")}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => (setOpen(false), setWord(""), setError(null))}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function LocaleSwitch({ locale }: { locale: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      {[
        { v: "ru", label: "Русский" },
        { v: "en", label: "English" },
      ].map((l) => (
        <Chip key={l.v} selected={locale === l.v} disabled={pending} onClick={() => start(async () => (await setLocale(l.v), router.refresh()))}>
          {l.label}
        </Chip>
      ))}
    </div>
  );
}

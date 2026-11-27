"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createApiToken } from "@/app/actions/settings";
import { Button } from "@/components/ui/primitives";

const RECIPES = [
  { key: "sleep", body: '{ "type": "sleep", "minutes": <Сумма> }' },
  { key: "workout", body: '{ "type": "workout", "kind": <Тип>, "minutes": <Длительность>, "started_at": <Начало> }' },
  { key: "walking", body: '{ "type": "walking", "steps": <Сумма> }' },
] as const;

/**
 * Часы и телефон (фаза 3d): отдельный ключ для автоматизаций и пошаговые рецепты «Команд».
 * Ключ — обычный личный токен; отозвать его можно в списке подключений выше.
 */
export function DevicesPanel({ ingestUrl }: { ingestUrl: string }) {
  const t = useTranslations("devices");
  const tc = useTranslations("common");
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const code = "block break-all rounded bg-black/40 px-2 py-1.5 font-mono text-xs";

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">{t("intro")}</p>

      <div className="space-y-1">
        <p className="text-xs text-muted">{t("url")}</p>
        <div className="flex items-center gap-2">
          <code className={`${code} min-w-0 flex-1`}>{ingestUrl}</code>
          <Button variant="outline" onClick={() => copy(ingestUrl, "url")}>
            {copied === "url" ? t("copied") : t("copy")}
          </Button>
        </div>
      </div>

      {token ? (
        <div className="space-y-2 rounded-xl border border-star/60 bg-star/5 p-3">
          <p className="text-star">{t("tokenOnce")}</p>
          <code className={code}>Bearer {token}</code>
          <Button variant="outline" onClick={() => copy(`Bearer ${token}`, "token")}>
            {copied === "token" ? t("copied") : t("copyHeader")}
          </Button>
        </div>
      ) : (
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await createApiToken(t("tokenLabel"));
              if (r.error) setError(tc(`errors.${r.error}`));
              else if (r.token) {
                setToken(r.token);
                router.refresh();
              }
            })
          }
        >
          {t("createToken")}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-hp">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <p className="font-medium">{t("iphoneTitle")}</p>
        <p className="text-xs text-muted">{t("iphoneIntro")}</p>
        {RECIPES.map((r) => (
          <details key={r.key} className="rounded-xl border border-panel-border p-3">
            <summary className="cursor-pointer">{t(`${r.key}.title`)}</summary>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted">
              {(t.raw(`${r.key}.steps`) as string[]).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
              <li>{t("requestStep")}</li>
            </ol>
            <code className={`${code} mt-2`}>{r.body}</code>
          </details>
        ))}
        <p className="text-xs text-muted">{t("after")}</p>
      </div>

      <details className="rounded-xl border border-panel-border p-3">
        <summary className="cursor-pointer">{t("androidTitle")}</summary>
        <p className="mt-2 text-xs text-muted">{t("android")}</p>
      </details>
    </div>
  );
}

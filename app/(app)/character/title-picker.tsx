"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { wearTitle } from "@/app/actions/game";
import { cn } from "@/components/ui/primitives";

export interface TitleItem {
  key: string;
  name: string;
  description: string;
  earnedOn: string | null;
}

/** Полученные титулы можно «носить» (один), неполученные видны с условием — как цель. */
export function TitlePicker({ titles, worn }: { titles: TitleItem[]; worn: string | null }) {
  const t = useTranslations("titles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const earned = titles.filter((x) => x.earnedOn);
  const locked = titles.filter((x) => !x.earnedOn);

  const choose = (key: string | null) =>
    start(async () => {
      setError(null);
      const r = await wearTitle(key);
      if (r.error) setError(tc(`errors.${r.error}`));
      else router.refresh();
    });

  return (
    <div className="space-y-4">
      {earned.length === 0 ? (
        <p className="text-sm text-muted">{t("none")}</p>
      ) : (
        <ul className="space-y-2" role="radiogroup" aria-label={t("wear")}>
          <li>
            <button
              type="button"
              role="radio"
              aria-checked={worn === null}
              disabled={pending}
              onClick={() => choose(null)}
              className={cn(
                "w-full rounded-xl border px-3 py-2 text-left text-sm",
                worn === null ? "border-accent text-accent" : "border-panel-border text-muted",
              )}
            >
              {t("noTitle")}
            </button>
          </li>
          {earned.map((x) => (
            <li key={x.key}>
              <button
                type="button"
                role="radio"
                aria-checked={worn === x.key}
                disabled={pending}
                onClick={() => choose(x.key)}
                className={cn(
                  "w-full rounded-xl border px-3 py-2 text-left",
                  worn === x.key ? "border-star bg-star/5" : "border-panel-border hover:border-accent/60",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("font-mono", worn === x.key && "text-star")}>«{x.name}»</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{x.earnedOn}</span>
                </span>
                <span className="block text-xs text-muted">{x.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-hp">
          {error}
        </p>
      )}
      {locked.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted">{t("locked", { count: locked.length })}</summary>
          <ul className="mt-2 space-y-1">
            {locked.map((x) => (
              <li key={x.key} className="rounded-lg border border-panel-border/50 px-3 py-1.5 opacity-70">
                <span className="block font-mono text-sm">«{x.name}»</span>
                <span className="block text-xs text-muted">{x.description}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

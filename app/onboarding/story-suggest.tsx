"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addSleepingSkill, suggestSleepingSkills } from "@/app/actions/onboarding";
import { useSystem } from "@/components/game/system-messages";
import { Button, Panel } from "@/components/ui/primitives";
import { targetLevelForHours } from "@/lib/game/onboarding";
import type { SleepingSuggestion } from "@/lib/server/llm/sleeping";

/** «Расскажи своими словами» → Система предлагает спящие навыки, человек добавляет нужные. */
export function StorySuggest() {
  const t = useTranslations("onboarding.skills");
  const tc = useTranslations("common");
  const tg = useTranslations("game");
  const router = useRouter();
  const { run, pending: adding } = useSystem();
  const [text, setText] = useState("");
  const [items, setItems] = useState<SleepingSuggestion[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Panel title={t("storyTitle")} className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={4}
        placeholder={t("storyPlaceholder")}
        aria-label={t("storyTitle")}
        className="w-full rounded-xl border border-panel-border bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <Button
        variant="outline"
        className="w-full"
        disabled={pending || text.trim().length < 5}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await suggestSleepingSkills(text);
            if (r.error) setError(tc(`errors.${r.error}`));
            else setItems(r.suggestions ?? []);
          })
        }
      >
        {pending ? t("storyParsing") : t("storyButton")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-hp">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.name} className="rounded-xl border border-panel-border p-3">
              <p className="flex items-baseline justify-between gap-2">
                <span>{s.name}</span>
                <span className="font-mono text-xs text-accent">
                  {t("estimate", { hours: s.past_hours, level: targetLevelForHours(s.past_hours) })}
                </span>
              </p>
              <p className="text-xs text-muted">
                {[s.primary, s.secondary].filter(Boolean).map((k) => tg(`attributes.${k}`)).join(" · ")} · {s.reasoning}
              </p>
              <Button
                variant={added.has(s.name) ? "ghost" : "outline"}
                className="mt-2"
                disabled={adding || added.has(s.name)}
                onClick={() =>
                  run(async () => {
                    await addSleepingSkill({ name: s.name, hours: s.past_hours, primary: s.primary, secondary: s.secondary });
                    setAdded((a) => new Set(a).add(s.name));
                    router.refresh();
                    return { messages: [] };
                  })
                }
              >
                {added.has(s.name) ? t("added") : t("addButton")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

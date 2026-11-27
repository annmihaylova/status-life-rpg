"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { submitCheckin } from "@/app/actions/checkin";
import { Button, Chip, Panel } from "@/components/ui/primitives";

export function CheckinForm({ available, maxChars }: { available: boolean; maxChars: number }) {
  const t = useTranslations("checkin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [text, setText] = useState("");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!available) {
    return (
      <Panel>
        <p className="text-sm text-muted">{t("unavailable")}</p>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-3">
      <p className="font-mono text-sm text-accent">{t("prompt")}</p>
      <p className="text-xs text-muted">{t("hint")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, maxChars))}
        rows={9}
        placeholder={t("placeholder")}
        aria-label={t("label")}
        className="w-full resize-y rounded-xl border border-panel-border bg-black/30 px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent"
      />
      <p className="text-right font-mono text-[10px] text-muted">
        {text.length}/{maxChars}
      </p>
      <div className="flex gap-2">
        <Chip selected={day === "today"} onClick={() => setDay("today")}>
          {t("today")}
        </Chip>
        <Chip selected={day === "yesterday"} onClick={() => setDay("yesterday")}>
          {t("yesterday")}
        </Chip>
      </div>
      <Button
        className="w-full"
        disabled={pending || text.trim().length < 10}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const r = await submitCheckin({ day, transcript: text });
              if (r.error) setError(tc(`errors.${r.error}`));
              else if (r.checkinId) router.push(`/checkin/${r.checkinId}`);
            } catch {
              setError(tc("errors.generic"));
            }
          })
        }
      >
        {pending ? t("parsing") : t("submit")}
      </Button>
      {pending && <p className="text-center text-xs text-muted">{t("parsingHint")}</p>}
      {error && (
        <p role="alert" className="text-sm text-hp">
          {error}
        </p>
      )}
    </Panel>
  );
}

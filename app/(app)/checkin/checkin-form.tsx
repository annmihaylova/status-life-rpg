"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState, useTransition } from "react";
import { submitCheckin } from "@/app/actions/checkin";
import { VoiceInput } from "@/components/game/voice-input";
import { Button, Chip, Panel } from "@/components/ui/primitives";
import { appendTranscript, claudePrompt } from "@/lib/checkin/voice";

/**
 * Вечерний отчёт (SPEC 4.2): текст или голос. Если разбор через API подключён — Система
 * разбирает отчёт сама; если нет — текст одной кнопкой уходит Claude, и он записывает день
 * через коннектор Status.
 */
export function CheckinForm({ available, maxChars }: { available: boolean; maxChars: number }) {
  const t = useTranslations("checkin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [text, setText] = useState("");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const onVoice = useCallback((chunk: string) => setText((prev) => appendTranscript(prev, chunk, maxChars)), [maxChars]);
  const ready = text.trim().length >= 10;

  const copyForClaude = async () => {
    try {
      await navigator.clipboard.writeText(claudePrompt(text.trim(), day, locale));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(tc("errors.generic"));
    }
  };

  return (
    <Panel className="space-y-3">
      <p className="font-mono text-sm text-accent">{t("prompt")}</p>
      <p className="text-xs text-muted">{t("hint")}</p>
      <VoiceInput lang={locale} onFinal={onVoice} />
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

      {available ? (
        <>
          <Button
            className="w-full"
            disabled={pending || !ready}
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
        </>
      ) : (
        <div className="space-y-2 rounded-xl border border-panel-border p-3">
          <p className="text-xs text-muted">{t("viaClaude")}</p>
          <Button className="w-full" disabled={!ready} onClick={copyForClaude}>
            {copied ? t("copiedForClaude") : t("copyForClaude")}
          </Button>
          {copied && <p className="text-xs text-accent">{t("pasteInClaude")}</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-hp">
          {error}
        </p>
      )}
    </Panel>
  );
}

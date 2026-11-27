"use client";

import { Mic, MicOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/primitives";
import { collectResults } from "@/lib/checkin/voice";

/** Минимальные типы Web Speech API (в lib.dom их нет). */
interface RecognitionEvent {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type State = "unknown" | "unsupported" | "idle" | "listening";

/**
 * Кнопка микрофона: распознавание речи браузера (бесплатно, PLAN 2г). Готовые фразы отдаёт
 * через `onFinal`, пока человек говорит — показывает промежуточный текст. Браузер сам
 * останавливается после паузы, поэтому, пока кнопка нажата, распознавание перезапускается.
 */
export function VoiceInput({ lang, onFinal }: { lang: string; onFinal: (chunk: string) => void }) {
  const t = useTranslations("voice");
  const [state, setState] = useState<State>("unknown");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    // наличие API известно только в браузере
    const ctor = recognitionCtor();
    queueMicrotask(() => setState(ctor ? "idle" : "unsupported"));
    return () => {
      wanted.current = false;
      rec.current?.abort();
    };
  }, []);

  const startSession = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    // на Android непрерывный режим дублирует фразы — там короткие сессии с перезапуском
    r.continuous = !/Android/i.test(navigator.userAgent);
    r.interimResults = true;
    r.lang = lang === "en" ? "en-US" : "ru-RU";
    let delivered = "";
    r.onresult = (e) => {
      const { final, interim: now } = collectResults(e.results);
      if (final.length > delivered.length && final.startsWith(delivered)) {
        onFinalRef.current(final.slice(delivered.length));
        delivered = final;
      } else if (final && final !== delivered) {
        onFinalRef.current(final);
        delivered = final;
      }
      setInterim(now);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? t("denied") : t("failed"));
    };
    r.onend = () => {
      setInterim("");
      delivered = ""; // новая сессия начинает результаты с нуля
      if (wanted.current) {
        try {
          r.start();
          return;
        } catch {
          wanted.current = false;
        }
      }
      setState("idle");
    };
    rec.current = r;
    r.start();
  };

  const toggle = () => {
    setError(null);
    if (state === "listening") {
      wanted.current = false;
      rec.current?.stop();
      setState("idle");
      return;
    }
    try {
      wanted.current = true;
      startSession();
      setState("listening");
    } catch {
      wanted.current = false;
      setError(t("failed"));
    }
  };

  if (state === "unknown") return null;
  if (state === "unsupported") return <p className="text-xs text-muted">{t("unsupported")}</p>;

  const listening = state === "listening";
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        className={cn(
          "flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 font-mono transition",
          listening
            ? "animate-pulse border-hp bg-hp/10 text-hp"
            : "border-accent/60 text-accent hover:bg-accent/10",
        )}
      >
        {listening ? <MicOff aria-hidden size={20} /> : <Mic aria-hidden size={20} />}
        {listening ? t("stop") : t("start")}
      </button>
      {listening && (
        <p aria-live="polite" className="min-h-5 text-sm italic text-muted">
          {interim || t("listening")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-hp">
          {error}
        </p>
      )}
    </div>
  );
}

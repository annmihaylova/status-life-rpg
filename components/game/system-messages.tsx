"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import type { UiSystemMessage } from "@/lib/server/game/mutate";

interface Ctx {
  show: (messages: UiSystemMessage[]) => void;
  /** вызвать серверное действие и показать его системные сообщения */
  run: <R extends { messages: UiSystemMessage[]; error?: string }>(
    action: () => Promise<R>,
  ) => Promise<R | undefined>;
  pending: boolean;
}

const SystemContext = createContext<Ctx | null>(null);

export function useSystem(): Ctx {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error("useSystem must be used inside SystemMessagesProvider");
  return ctx;
}

/** Задержка между строками «окна Системы». */
const LINE_MS = 550;

export function SystemMessagesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const [queue, setQueue] = useState<UiSystemMessage[]>([]);
  const [queueId, setQueueId] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const show = useCallback((messages: UiSystemMessage[]) => {
    if (messages.length) {
      setQueue(messages);
      setQueueId((n) => n + 1);
    }
  }, []);

  const run = useCallback<Ctx["run"]>(
    (action) =>
      new Promise((resolve) => {
        startTransition(async () => {
          try {
            const r = await action();
            if (r.error) setError(t(`errors.${r.error}`));
            else show(r.messages);
            resolve(r);
          } catch {
            setError(t("errors.generic"));
            resolve(undefined);
          }
        });
      }),
    [show, t],
  );

  return (
    <SystemContext value={{ show, run, pending }}>
      {children}
      <SystemWindow key={queueId} messages={queue} onClose={() => setQueue([])} />
      <AnimatePresence>
        {error && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-xl border border-hp/50 bg-background/95 p-3 text-sm text-hp"
            onAnimationComplete={() => setTimeout(() => setError(null), 3500)}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </SystemContext>
  );
}

function SystemWindow({ messages, onClose }: { messages: UiSystemMessage[]; onClose: () => void }) {
  const t = useTranslations("common");
  const reduce = useReducedMotion();
  // окно пересоздаётся на каждый новый набор сообщений (key в провайдере)
  const [revealed, setRevealed] = useState(0);
  const visible = reduce ? messages.length : revealed;
  const epic = messages.find((m) => m.tone === "epic");

  useEffect(() => {
    if (reduce || messages.length === 0) return;
    const timers = messages.map((_, i) => setTimeout(() => setRevealed(i + 1), (i + 1) * LINE_MS));
    return () => timers.forEach(clearTimeout);
  }, [messages, reduce]);

  if (messages.length === 0) return null;
  const done = visible >= messages.length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("systemWindow")}
      onClick={done ? onClose : undefined}
    >
      {epic && !reduce && (
        <motion.div
          className="pointer-events-none fixed inset-0"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          style={{ background: "radial-gradient(circle, rgb(139 147 255 / 0.55), transparent 70%)" }}
        />
      )}
      <motion.section
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="system-panel w-full max-w-md space-y-2 p-5 font-mono text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <ul className="space-y-2" aria-live="polite">
          {messages.slice(0, visible).map((m) => (
            <motion.li
              key={m.id}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className={
                m.tone === "epic"
                  ? "text-base text-accent drop-shadow-[0_0_10px_var(--glow)]"
                  : m.tone === "rare"
                    ? "text-star"
                    : "text-foreground"
              }
            >
              {m.tone === "rare" && !reduce ? (
                <motion.span
                  initial={{ textShadow: "0 0 0px #ffd46b" }}
                  animate={{ textShadow: ["0 0 14px #ffd46b", "0 0 0px #ffd46b"] }}
                  transition={{ duration: 1.4 }}
                >
                  {m.text}
                </motion.span>
              ) : (
                m.text
              )}
            </motion.li>
          ))}
        </ul>
        {done && (
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="mt-2 w-full rounded-lg border border-panel-border py-2 text-muted hover:text-foreground"
          >
            {t("ok")}
          </button>
        )}
      </motion.section>
    </div>
  );
}

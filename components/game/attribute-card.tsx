"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Bar, Stars } from "@/components/ui/primitives";
import { isPartKey, parentOf, partsOf, type AttributeKey, type GeneralKey } from "@/lib/game/attributes";

export interface AttributeCardData {
  key: AttributeKey;
  value: number;
  stars: number;
  state: "general" | "unfolded" | "part";
  color: string;
  /** XP и активных дней не хватает до следующего очка */
  xpToPoint: number;
  daysToPoint: number;
  /** прогресс условий раскрытия (только для общих) */
  unfold: { level: number; levelNeed: number; xp: number; xpNeed: number; days: number; daysNeed: number } | null;
  /** навыки пользователя, которые качают эту характеристику */
  skills: string[];
}

export function AttributeCard({ a }: { a: AttributeCardData }) {
  const t = useTranslations("attrSheet");
  const tg = useTranslations("game");
  const tStatus = useTranslations("status");
  const [open, setOpen] = useState(false);
  const name = tg(`attributes.${a.key}`);
  const ready = a.unfold
    ? [a.unfold.level >= a.unfold.levelNeed, a.unfold.xp >= a.unfold.xpNeed, a.unfold.days >= a.unfold.daysNeed].filter(Boolean).length
    : 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open", { attr: name })}
        className="w-full rounded-xl border p-2 text-left transition hover:brightness-125"
        style={{ borderColor: `color-mix(in oklab, ${a.color} 45%, transparent)` }}
      >
        <span className="block truncate text-xs" style={{ color: a.color }}>
          {name}
        </span>
        <span className="block font-mono text-2xl">{a.value}</span>
        <Stars count={a.stars} label={tStatus("stars", { stars: a.stars })} />
        {a.unfold && (
          <span className="mt-1 block font-mono text-[10px] text-muted">
            {tStatus("unfoldReadiness", { ready, total: 3 })}
          </span>
        )}
      </button>
      <AttributeSheet a={a} name={name} open={open} onClose={() => setOpen(false)} />
    </li>
  );
}

function AttributeSheet({
  a,
  name,
  open,
  onClose,
}: {
  a: AttributeCardData;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("attrSheet");
  const tg = useTranslations("game");
  const tStatus = useTranslations("status");
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isPart = isPartKey(a.key);
  const parts = isPart ? [] : partsOf(a.key as GeneralKey);
  const isEndurance = a.key === "endurance" || a.key === "body";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={name}
            initial={reduce ? false : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="system-panel max-h-[85vh] w-full max-w-md space-y-4 overflow-y-auto rounded-b-none p-5 sm:rounded-2xl"
            style={{ borderColor: a.color }}
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: a.color }}>
                  {name}
                </h2>
                <p className="font-mono text-sm text-muted">{t("value", { value: a.value })}</p>
                {isPart && (
                  <p className="text-xs text-muted">
                    {t("partOf", { parent: tg(`attributes.${parentOf(a.key as never)}`) })}
                  </p>
                )}
              </div>
              <button type="button" onClick={onClose} autoFocus className="rounded-lg px-2 py-1 text-muted hover:text-foreground" aria-label={t("close")}>
                ✕
              </button>
            </header>

            <section className="space-y-1">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted">{t("about")}</h3>
              <p className="text-sm">{tg(`attrInfo.${a.key}.about`)}</p>
              <p className="text-xs text-muted">{isEndurance ? t("hpBonus") : t("bonus")}</p>
            </section>

            <section className="space-y-1">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted">{t("grows")}</h3>
              <p className="text-sm">{tg(`attrInfo.${a.key}.grows`)}</p>
            </section>

            <section className="space-y-1">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted">{t("yourSkills")}</h3>
              <p className="text-sm">{a.skills.length ? a.skills.join(" · ") : t("noSkills")}</p>
            </section>

            {a.state !== "unfolded" && (
              <section className="space-y-2">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted">{t("progress")}</h3>
                <Stars count={a.stars} label={tStatus("stars", { stars: a.stars })} />
                <p className="font-mono text-xs">
                  {t("progressLine", { stars: a.stars, xp: Math.max(0, Math.ceil(a.xpToPoint)), days: Math.max(0, a.daysToPoint) })}
                </p>
                <p className="text-xs text-muted">{t("rules")}</p>
              </section>
            )}

            {parts.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted">{t("unfoldsInto")}</h3>
                <ul className="space-y-1.5">
                  {parts.map((p) => (
                    <li key={p} className="text-sm">
                      <span className="font-medium">{tg(`attributes.${p}`)}</span>
                      <span className="text-muted"> — {tg(`attrInfo.${p}.about`)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {a.unfold && (
              <section className="space-y-2">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted">{t("unfoldTitle")}</h3>
                <p className="text-xs text-muted">{t("unfoldText")}</p>
                {[
                  { label: t("condLevel", { now: a.unfold.level, need: a.unfold.levelNeed }), v: a.unfold.level, m: a.unfold.levelNeed },
                  { label: t("condXp", { now: Math.floor(a.unfold.xp), need: a.unfold.xpNeed }), v: a.unfold.xp, m: a.unfold.xpNeed },
                  { label: t("condDays", { now: a.unfold.days, need: a.unfold.daysNeed }), v: a.unfold.days, m: a.unfold.daysNeed },
                ].map((c) => (
                  <div key={c.label} className="space-y-1">
                    <p className="font-mono text-xs">{c.label}</p>
                    <Bar value={Math.min(c.v, c.m)} max={c.m} color={a.color} label={c.label} />
                  </div>
                ))}
              </section>
            )}
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}

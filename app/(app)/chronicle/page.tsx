import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Bar, Panel } from "@/components/ui/primitives";
import type { AttributeKey } from "@/lib/game/attributes";
import { heatLevel, templateLetter, type PeriodSummary } from "@/lib/game/chronicle";
import { addDays } from "@/lib/game/dates";
import { titleName } from "@/lib/game/progression";
import { getChronicle } from "@/lib/server/game/chronicle";
import { requireUserId } from "@/lib/server/session";
import { attrColor, formatHours } from "@/lib/ui/game";
import { PeriodTabs } from "./period-tabs";

const HEAT = ["bg-panel-border/40", "bg-accent/25", "bg-accent/45", "bg-accent/70", "bg-accent"] as const;

export default async function ChroniclePage() {
  const userId = await requireUserId();
  const [c, t, tg, locale] = await Promise.all([
    getChronicle(userId),
    getTranslations("chronicle"),
    getTranslations("game"),
    getLocale(),
  ]);
  const loc = locale === "en" ? "en" : "ru";
  const h = (minutes: number) => formatHours(minutes, locale);
  const skill = (id: string) => c.skillName.get(id) ?? "?";
  const domain = (d: string) => (tg.has(`domains.${d}`) ? tg(`domains.${d}`) : d);
  const attr = (k: AttributeKey) => tg(`attributes.${k}`);
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  const fmtDate = (d: string) => dateFmt.format(new Date(`${d}T12:00:00Z`));

  // ───────── сравнение ─────────
  const { past, now } = c.compare;
  const pastAttr = new Map(past.attributes.map((a) => [a.key, a.value]));
  const pastSkill = new Map(past.skills.map((s) => [s.skillId, s.level]));

  // ───────── итоги периода ─────────
  const summary = (s: PeriodSummary): ReactNode => {
    if (s.entries === 0) return <p className="text-sm text-muted">{t("nothing")}</p>;
    const maxDomain = s.domains[0]?.minutes ?? 1;
    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            [t("focusHours"), t("hours", { hours: h(s.minutes) })],
            [t("activeDays"), s.activeDays],
            [t("entries"), s.entries],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-panel-border p-2">
              <dt className="text-[10px] text-muted">{label}</dt>
              <dd className="font-mono text-lg">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-2">
          <p className="text-xs text-muted">{t("byDomain")}</p>
          <ul className="space-y-1.5">
            {s.domains.map((d) => (
              <li key={d.domain} className="space-y-0.5">
                <p className="flex justify-between text-sm">
                  <span>{domain(d.domain)}</span>
                  <span className="font-mono text-xs text-muted">{t("hours", { hours: h(d.minutes) })}</span>
                </p>
                <Bar value={d.minutes} max={maxDomain} label={domain(d.domain)} />
              </li>
            ))}
          </ul>
        </div>
        {s.levelTo > s.levelFrom && <p className="font-mono text-sm text-accent">{t("levelUp", { from: s.levelFrom, to: s.levelTo })}</p>}
        {s.newSkills.length > 0 && <Line label={t("newSkills")} value={s.newSkills.map(skill).join(", ")} />}
        {s.rankUps.length > 0 && (
          <Line label={t("rankUps")} value={s.rankUps.map((r) => `${skill(r.skillId)} — ${tg(`ranks.${r.rank}`)}`).join(", ")} />
        )}
        {s.titles.length > 0 && <Line label={t("titlesEarned")} value={s.titles.map((k) => `«${titleName(k, loc)}»`).join(", ")} />}
      </div>
    );
  };

  // ───────── письмо ─────────
  const letterLines = c.letter.claudeText
    ? null
    : templateLetter(c.letter.summary, c.letter.prev, {
        skill,
        domain,
        title: (k) => titleName(k, loc),
        rank: (r) => tg(`ranks.${r}`),
      });

  // ───────── heatmap: колонки — недели, строки — дни недели ─────────
  const weeks: { date: string; minutes: number }[][] = [];
  c.heat.days.forEach((d, i) => {
    (weeks[Math.floor(i / 7)] ??= []).push(d);
  });

  return (
    <>
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      <Panel title={c.compare.days >= 30 ? t("compareTitle", { days: c.compare.days }) : t("compareStart")}>
        <div className="space-y-3">
          <Compare label={t("level")} was={past.level} now={now.level} />
          <Compare label={t("xp")} was={Math.round(past.totalXp)} now={Math.round(now.totalXp)} />
          <div className="space-y-1">
            <p className="text-xs text-muted">{t("attributes")}</p>
            <ul className="grid grid-cols-3 gap-2">
              {now.attributes.map((a) => (
                <li key={a.key} className="rounded-xl border border-panel-border p-2 text-center">
                  <p className="text-[10px]" style={{ color: attrColor(a.key) }}>
                    {attr(a.key)}
                  </p>
                  <p className="font-mono">
                    <span className="text-xs text-muted">{pastAttr.get(a.key) ?? "—"} → </span>
                    {a.value}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          {now.skills.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted">{t("topSkills")}</p>
              <ul className="space-y-1">
                {now.skills.slice(0, 5).map((s) => (
                  <li key={s.skillId} className="flex justify-between text-sm">
                    <span className="truncate">{skill(s.skillId)}</span>
                    <span className="shrink-0 font-mono text-xs">
                      <span className="text-muted">{pastSkill.get(s.skillId) ?? 1} → </span>
                      {s.level}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <PeriodTabs labels={[t("week"), t("month")]} panels={[summary(c.week), summary(c.month)]} />
      </Panel>

      <Panel title={t("letterTitle")} className="space-y-3">
        <p className="font-mono text-xs text-muted">{t("letterWeek", { from: fmtDate(c.letter.weekStart) })}</p>
        {c.letter.claudeText ? (
          <p className="whitespace-pre-line text-sm leading-relaxed">{c.letter.claudeText}</p>
        ) : (
          <div className="space-y-1.5 text-sm leading-relaxed">
            {letterLines!.map((l, i) => (
              <p key={i} className={l.key === "closing" ? "font-mono text-xs text-accent" : undefined}>
                {t(`letter.${l.key}`, l.values ?? {})}
              </p>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">{c.letter.claudeText ? t("fromClaude") : t("fromTemplate")}</p>
        {!c.letter.claudeText && <p className="text-xs text-muted">{t("letterHint")}</p>}
      </Panel>

      <Panel title={t("allTime")}>
        <ul className="space-y-1 font-mono text-sm">
          <li>{t("allTimeHours", { hours: h(c.allTime.minutes) })}</li>
          <li>{t("allTimeEntries", { count: c.allTime.entries })}</li>
          <li>{t("allTimeDays", { count: c.allTime.activeDays })}</li>
        </ul>
        {c.allTime.skills.length > 0 && (
          <ul className="mt-3 space-y-1">
            {c.allTime.skills.slice(0, 8).map((s) => (
              <li key={s.skillId} className="flex justify-between text-sm">
                <span className="truncate">{skill(s.skillId)}</span>
                <span className="shrink-0 font-mono text-xs text-muted">{t("hours", { hours: h(s.minutes) })}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t("heatmap")}>
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
          role="img"
          aria-label={t("heatmap")}
        >
          {weeks.map((w) => (
            <div key={w[0].date} className="flex flex-col gap-[2px]">
              {w.map((d) => (
                <span
                  key={d.date}
                  title={t("dayMinutes", { date: fmtDate(d.date), hours: h(d.minutes) })}
                  className={`block aspect-square w-full rounded-[2px] ${HEAT[heatLevel(d.minutes)]}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
          <span>{fmtDate(c.heat.start)} — {fmtDate(addDays(c.today, 0))}</span>
          <span className="flex items-center gap-1">
            {t("less")}
            {HEAT.map((cls) => (
              <span key={cls} className={`block size-2.5 rounded-[2px] ${cls}`} />
            ))}
            {t("more")}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">{t("heatmapHint")}</p>
      </Panel>
    </>
  );
}

function Compare({ label, was, now }: { label: string; was: number; now: number }) {
  return (
    <p className="flex items-baseline justify-between">
      <span className="text-sm">{label}</span>
      <span className="font-mono">
        <span className="text-sm text-muted">{was} → </span>
        <span className={now > was ? "text-accent" : undefined}>{now}</span>
      </span>
    </p>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="text-xs text-muted">{label}: </span>
      {value}
    </p>
  );
}

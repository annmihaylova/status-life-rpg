import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { SkillMeasurement } from "@/components/game/measurement";
import { SkillActions, SkillTagPicker } from "@/components/game/skill-actions";
import { Bar, Panel, cn } from "@/components/ui/primitives";
import { GENERAL_KEYS, type AttributeKey, type GeneralKey } from "@/lib/game/attributes";
import { GAME_CONFIG } from "@/lib/game/config";
import { addDays } from "@/lib/game/dates";
import { characterLevelFromXp, mainSlots, secondarySlots, skillLevelFromXp, skillRank } from "@/lib/game/formulas";
import { withUser } from "@/lib/db";
import { latestMeasurements } from "@/lib/server/game/measurements";
import { getGameView } from "@/lib/server/game/queries";
import { requireUserId } from "@/lib/server/session";
import { formatHours, tagLabel } from "@/lib/ui/game";

export default async function SkillsPage({ searchParams }: PageProps<"/skills">) {
  const userId = await requireUserId();
  const { sort } = await searchParams;
  const byRecent = sort === "recent";
  const [view, t, tg, locale] = await Promise.all([
    getGameView(userId),
    getTranslations("skills"),
    getTranslations("game"),
    getLocale(),
  ]);
  const measured = await withUser(userId, (tx) => latestMeasurements(tx, userId));
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const r = view.result;
  const level = characterLevelFromXp(r.character.totalXp).level;
  const unfolded = new Set(GENERAL_KEYS.filter((g) => r.attributes[g]?.state === "unfolded")) as Set<GeneralKey>;
  const short = (k: AttributeKey) => tg(`short.${k}`);

  const rows = view.skills
    .map((row) => ({ row, state: r.skills[row.id], minutes: view.skillMinutes.get(row.id) }))
    .filter((x) => x.state);
  const lastActive = (x: (typeof rows)[number]) =>
    [...(x.minutes?.byDay.keys() ?? [])].sort().at(-1) ?? "";
  rows.sort((a, b) => (byRecent ? lastActive(b).localeCompare(lastActive(a)) : b.state.xp - a.state.xp));

  const active = rows.filter((x) => x.state.status === "active");
  const sleeping = rows.filter((x) => x.state.status === "sleeping");
  const archived = rows.filter((x) => x.state.status === "archived");
  const used = (slot: "main" | "secondary") => active.filter((x) => x.state.slot === slot).length;

  const domains = new Map<string, typeof active>();
  for (const x of active) {
    const d = x.row.domain ?? "other";
    domains.set(d, [...(domains.get(d) ?? []), x]);
  }

  const candidates = Object.values(r.candidates)
    .filter((c) => c.offerStatus === "accruing" || c.offerStatus === "snoozed")
    .sort((a, b) => b.minutesTotal - a.minutesTotal);
  const candName = new Map(view.candidates.map((c) => [c.clusterKey, c.suggestedName ?? c.clusterKey]));
  const cfg = GAME_CONFIG.skillOffers;
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(view.today, i - 29));

  const skillItem = (x: (typeof rows)[number], dim = false) => {
    const sp = skillLevelFromXp(x.state.xp);
    const tags = tagLabel(x.row.primaryAttrKey, x.row.secondaryAttrKey, unfolded, short);
    const series = days30.map((d) => x.minutes?.byDay.get(d) ?? 0);
    return (
      <li key={x.row.id} className={cn("space-y-2 border-b border-panel-border/50 pb-3 last:border-0", dim && "opacity-60")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate">{x.row.name}</span>
            <span className="text-xs text-muted">
              {tags}
              {x.state.status === "active" && ` · ${t(`slot.${x.state.slot}`)}`}
            </span>
          </span>
          <span className="shrink-0 text-right font-mono text-sm">
            {x.state.status === "sleeping"
              ? t("sleepingTarget", { level: x.row.sleepingTargetLevel ?? 1 })
              : `${x.state.level} · ${tg(`ranks.${skillRank(x.state.level)}`)}`}
          </span>
        </div>
        {x.state.status !== "sleeping" && (
          <>
            <Bar value={sp.xpIntoLevel} max={sp.xpForLevel} label={x.row.name} />
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-muted">
                {t("hours", { hours: formatHours(x.minutes?.total ?? 0, locale) })}
              </span>
              <Sparkline values={series} label={t("sparkline")} />
            </div>
          </>
        )}
        {x.row.scope && <p className="text-xs text-muted">{x.row.scope}</p>}
        {x.row.primaryAttrKey && (
          <p className="text-xs text-accent/80">
            {t("raises", {
              attrs: [x.row.primaryAttrKey, x.row.secondaryAttrKey]
                .filter((k): k is string => Boolean(k))
                .map((k) => tg(`attributes.${k}`))
                .join(" · "),
            })}
          </p>
        )}
        {x.state.specializations.length > 0 && (
          <p className="text-xs text-muted">{x.state.specializations.map((s) => s.name).join(" · ")}</p>
        )}
        {!x.row.primaryAttrKey && x.state.status !== "sleeping" && <SkillTagPicker skillId={x.row.id} />}
        {x.state.status !== "archived" && (
          <SkillMeasurement
            skillId={x.row.id}
            today={view.today}
            latest={(() => {
              const m = measured.get(x.row.id);
              return m
                ? { id: m.id, scale: m.scale, text: m.text, unit: m.unit, date: dateFmt.format(new Date(`${m.measuredOn}T00:00:00Z`)), note: m.note, trend: m.trend }
                : null;
            })()}
          />
        )}
        <SkillActions skillId={x.row.id} slot={x.state.slot} status={x.state.status} />
      </li>
    );
  };

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <nav className="flex gap-3 text-xs" aria-label={t("sortLabel")}>
          <Link href="/skills" aria-current={!byRecent ? "true" : undefined} className={!byRecent ? "text-accent" : "text-muted"}>
            {t("sortLevel")}
          </Link>
          <Link href="/skills?sort=recent" aria-current={byRecent ? "true" : undefined} className={byRecent ? "text-accent" : "text-muted"}>
            {t("sortRecent")}
          </Link>
        </nav>
      </header>
      <p className="font-mono text-xs text-muted">
        {t("slots", {
          main: used("main"),
          maxMain: mainSlots(level),
          secondary: used("secondary"),
          maxSecondary: secondarySlots(level),
        })}
      </p>

      {active.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}
      {[...domains.entries()].map(([domain, list]) => (
        <Panel key={domain} title={tg(`domains.${domain}`)}>
          <ul className="space-y-3">{list.map((x) => skillItem(x))}</ul>
        </Panel>
      ))}

      {sleeping.length > 0 && (
        <Panel title={t("sleeping")}>
          <ul className="space-y-3">{sleeping.map((x) => skillItem(x, true))}</ul>
        </Panel>
      )}

      {candidates.length > 0 && (
        <Panel title={t("candidates")}>
          <ul className="space-y-3">
            {candidates.map((c) => (
              <li key={c.cluster} className="space-y-1">
                <p className="flex justify-between gap-2 text-sm">
                  <span className="truncate">{candName.get(c.cluster)}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {t("candidateProgress", {
                      minutes: Math.round(c.minutesTotal),
                      need: cfg.minMinutes,
                      days: c.daysSeen,
                      needDays: cfg.minDistinctDays,
                    })}
                  </span>
                </p>
                <Bar value={Math.min(c.minutesTotal, cfg.minMinutes)} max={cfg.minMinutes} label={candName.get(c.cluster) ?? c.cluster} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {archived.length > 0 && (
        <Panel title={t("archive")}>
          <ul className="space-y-3">{archived.map((x) => skillItem(x, true))}</ul>
        </Panel>
      )}
    </>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const w = 90;
  const h = 20;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0">
      <polyline points={pts} fill="none" stroke="var(--xp)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

import { getLocale, getTranslations } from "next-intl/server";
import { Portrait } from "@/components/game/portrait";
import {
  SkillOfferCard,
  SpecializationCard,
  UnfoldCalibration,
  UnfoldCard,
  WellbeingWidget,
} from "@/components/game/status-widgets";
import { Bar, Panel, Stars } from "@/components/ui/primitives";
import { GENERAL_KEYS, partsOf, type AttributeKey, type GeneralKey } from "@/lib/game/attributes";
import { GAME_CONFIG } from "@/lib/game/config";
import { characterLevelFromXp, skillLevelFromXp, skillRank, unfoldValues } from "@/lib/game/formulas";
import { getGameView } from "@/lib/server/game/queries";
import { requireUserId } from "@/lib/server/session";
import { attrColor, tagLabel } from "@/lib/ui/game";

export default async function StatusPage() {
  const userId = await requireUserId();
  const [view, t, tg, locale] = await Promise.all([
    getGameView(userId),
    getTranslations("status"),
    getTranslations("game"),
    getLocale(),
  ]);
  const r = view.result;
  const lp = characterLevelFromXp(r.character.totalXp);
  const unfolded = new Set(
    GENERAL_KEYS.filter((g) => r.attributes[g]?.state === "unfolded"),
  ) as Set<GeneralKey>;
  const attrName = (k: AttributeKey) => tg(`attributes.${k}`);
  const short = (k: AttributeKey) => tg(`short.${k}`);

  // карточки характеристик: общие или их части после раскрытия
  const attrCards = GENERAL_KEYS.flatMap((g) => (unfolded.has(g) ? partsOf(g) : [g]))
    .map((k) => r.attributes[k])
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const skillById = new Map(view.skills.map((s) => [s.id, s]));
  const mainSkills = Object.values(r.skills)
    .filter((s) => s.status === "active" && s.slot === "main")
    .map((s) => ({ state: s, row: skillById.get(s.id) }))
    .filter((x) => x.row)
    .sort((a, b) => b.state.xp - a.state.xp);

  const offers = Object.values(r.candidates).filter((c) => c.offerStatus === "offered");
  const candName = new Map(view.candidates.map((c) => [c.clusterKey, c.suggestedName ?? c.clusterKey]));
  const pendingSpecs = Object.values(r.skills).flatMap((s) =>
    s.pendingSpecializations.map((m) => ({ skillId: s.id, milestone: m, name: skillById.get(s.id)?.name ?? "" })),
  );
  const unfoldOffers = GENERAL_KEYS.filter(
    (g) => r.attributes[g]?.unfoldOfferedOn && !unfolded.has(g) && !view.declinedUnfold.has(g),
  );
  const openUnfoldCal = r.calibrations.filter(
    (c) => c.kind === "unfold" && !c.closed && view.today <= c.expires,
  );

  const hp = r.hpDays[view.today];
  const wellbeing = view.input.wellbeing[view.today];
  const u = GAME_CONFIG.attributes.unfold;
  const level = lp.level;

  return (
    <>
      <Panel>
        <div className="flex items-center gap-4">
          <Portrait color={attrColor(topAttribute(attrCards))} label={t("portrait")} />
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="truncate text-lg font-semibold">{view.character.gameName || t("noName")}</h1>
            <p className="text-xs text-muted">
              {level < 10 ? t("classLocked") : t("classPending")}
            </p>
            <p className="font-mono text-2xl">{t("level", { level })}</p>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <Bar value={lp.xpIntoLevel} max={lp.xpForLevel} label={t("xpLabel")} />
          <p className="flex justify-between font-mono text-xs text-muted">
            <span>
              {Math.floor(lp.xpIntoLevel)} / {lp.xpForLevel} XP
            </span>
            <span>{t("today", { xp: Math.round(view.todayXp) })}</span>
          </p>
        </div>
      </Panel>

      {hp && (
        <Panel title={t("hp")}>
          <div className="space-y-2">
            <Bar value={hp.current} max={hp.max} color="var(--hp)" label={t("hp")} />
            <p className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span>
                {hp.current} / {hp.max}
              </span>
              {hp.effects.map((e) => (
                <span key={e} className="rounded-full border border-panel-border px-2 py-0.5 text-muted">
                  {tg(`effects.${e}`)}
                </span>
              ))}
            </p>
            {hp.suggestRest && <p className="text-xs text-hp">{t("restAdvice")}</p>}
            <WellbeingWidget
              date={view.today}
              sleepHours={wellbeing?.sleepHours ?? null}
              sick={wellbeing?.sick ?? false}
              manualRest={wellbeing?.manualRest ?? false}
            />
          </div>
        </Panel>
      )}

      {offers.map((c) => (
        <SkillOfferCard key={c.cluster} cluster={c.cluster} name={candName.get(c.cluster) ?? c.cluster} />
      ))}
      {pendingSpecs.map((s) => (
        <SpecializationCard key={`${s.skillId}:${s.milestone}`} skillId={s.skillId} skillName={s.name} milestone={s.milestone} />
      ))}
      {unfoldOffers.map((g) => {
        const parts = partsOf(g);
        const vals = unfoldValues(
          r.attributes[g]!.value,
          parts.map((p) => r.attributeTagXp[g]?.[p] ?? 0),
        );
        const preview = parts
          .map((p, i) => ({ p, v: vals[i] }))
          .sort((a, b) => b.v - a.v)
          .map(({ p, v }) => `${attrName(p)} ${v}`)
          .join(" · ");
        return <UnfoldCard key={g} general={g} title={attrName(g)} preview={preview} />;
      })}
      {openUnfoldCal.map((c) => (
        <UnfoldCalibration
          key={c.general}
          general={c.general!}
          keys={c.keys}
          names={Object.fromEntries(c.keys.map((k) => [k, attrName(k)]))}
          base={c.base}
          current={Object.fromEntries(c.keys.map((k) => [k, r.attributes[k]?.value ?? 10]))}
          rules={c.rules}
        />
      ))}

      <Panel title={t("attributes")}>
        <ul className="grid grid-cols-3 gap-2">
          {attrCards.map((a) => {
            const color = attrColor(a.key);
            const general = a.state === "general";
            const ready = general
              ? [level >= u.minCharacterLevel, a.xpTotal >= u.minXpSinceStart, a.activeDaysTotal >= u.minActiveDays].filter(Boolean).length
              : 0;
            return (
              <li key={a.key} className="rounded-xl border p-2" style={{ borderColor: `color-mix(in oklab, ${color} 45%, transparent)` }}>
                <p className="truncate text-xs" style={{ color }}>
                  {attrName(a.key)}
                </p>
                <p className="font-mono text-2xl">{a.value}</p>
                <Stars count={a.stars} label={t("stars", { stars: a.stars })} />
                {general && (
                  <p className="mt-1 font-mono text-[10px] text-muted" title={t("unfoldReadinessHint")}>
                    {t("unfoldReadiness", { ready, total: 3 })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title={t("mainSkills")}>
        {mainSkills.length === 0 ? (
          <p className="text-sm text-muted">{t("noSkills")}</p>
        ) : (
          <ul className="space-y-3">
            {mainSkills.map(({ state, row }) => {
              const sp = skillLevelFromXp(state.xp);
              const tags = tagLabel(row!.primaryAttrKey, row!.secondaryAttrKey, unfolded, short);
              return (
                <li key={state.id} className="space-y-1">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="truncate">
                      {row!.name}
                      {tags && <span className="text-xs text-muted"> ({tags})</span>}
                    </span>
                    <span className="shrink-0 font-mono text-sm">
                      {state.level} · {tg(`ranks.${skillRank(state.level)}`)}
                    </span>
                  </p>
                  <Bar value={sp.xpIntoLevel} max={sp.xpForLevel} label={row!.name} />
                  {state.specializations.length > 0 && (
                    <p className="text-xs text-muted">{state.specializations.map((s) => s.name).join(" · ")}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <p className="text-center text-xs text-muted">{new Date().toLocaleDateString(locale)}</p>
    </>
  );
}

function topAttribute(cards: { key: AttributeKey; value: number }[]): AttributeKey {
  return cards.reduce((a, b) => (b.value > a.value ? b : a), cards[0] ?? { key: "mind", value: 10 }).key;
}

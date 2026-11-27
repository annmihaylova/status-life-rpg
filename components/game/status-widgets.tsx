"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  chooseSpecialization,
  declineOffer,
  declineUnfold,
  setWellbeing,
  snoozeOffer,
  takeOfferedSkill,
  unfoldAttribute,
} from "@/app/actions/game";
import { calibrate, finishCalibration } from "@/app/actions/onboarding";
import { Button, Chip, Panel } from "@/components/ui/primitives";
import { useSystem } from "./system-messages";

const SLEEP_OPTIONS = [4, 5, 6, 7, 8, 9] as const;

export function WellbeingWidget({
  date,
  sleepHours,
  sick,
  manualRest,
}: {
  date: string;
  sleepHours: number | null;
  sick: boolean;
  manualRest: boolean;
}) {
  const t = useTranslations("status.wellbeing");
  const { run, pending } = useSystem();
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{t("sleep")}</p>
      <div className="flex flex-wrap gap-1.5">
        {SLEEP_OPTIONS.map((h) => (
          <Chip
            key={h}
            disabled={pending}
            selected={sleepHours != null && (h === 9 ? sleepHours >= 9 : h === 4 ? sleepHours <= 4 : sleepHours === h)}
            onClick={() => run(() => setWellbeing({ date, sleepHours: h }))}
            className="min-w-11 font-mono"
          >
            {h === 4 ? "≤4" : h === 9 ? "9+" : h}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip selected={sick} disabled={pending} onClick={() => run(() => setWellbeing({ date, sick: !sick }))}>
          {t("sick")}
        </Chip>
        <Chip
          selected={manualRest}
          disabled={pending}
          onClick={() => run(() => setWellbeing({ date, manualRest: !manualRest }))}
        >
          {t("rest")}
        </Chip>
      </div>
    </div>
  );
}

export function SkillOfferCard({ cluster, name }: { cluster: string; name: string }) {
  const t = useTranslations("status.offer");
  const { run, pending } = useSystem();
  return (
    <Panel className="space-y-3 border-accent">
      <p className="font-mono text-sm">{t("text", { name })}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run(() => takeOfferedSkill({ clusterKey: cluster, slot: "main" }))}>
          {t("takeMain")}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => takeOfferedSkill({ clusterKey: cluster, slot: "secondary" }))}
        >
          {t("takeSecondary")}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => run(() => snoozeOffer(cluster))}>
          {t("later")}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => run(() => declineOffer(cluster))}>
          {t("never")}
        </Button>
      </div>
    </Panel>
  );
}

export function SpecializationCard({
  skillId,
  skillName,
  milestone,
}: {
  skillId: string;
  skillName: string;
  milestone: number;
}) {
  const t = useTranslations("status.specialization");
  const { run, pending } = useSystem();
  const [name, setName] = useState("");
  return (
    <Panel className="space-y-3">
      <p className="font-mono text-sm">{t("text", { skill: skillName, milestone })}</p>
      <p className="text-xs text-muted">{t("hint")}</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) run(() => chooseSpecialization({ skillId, milestone, name: name.trim() }));
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          aria-label={t("label")}
          placeholder={t("placeholder")}
          className="min-w-0 flex-1 rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
        />
        <Button type="submit" disabled={pending || name.trim().length < 2}>
          {t("choose")}
        </Button>
      </form>
    </Panel>
  );
}

export function UnfoldCard({
  general,
  title,
  preview,
}: {
  general: string;
  title: string;
  preview: string;
}) {
  const t = useTranslations("status.unfold");
  const { run, pending } = useSystem();
  return (
    <Panel className="space-y-3 border-star">
      <p className="font-mono text-sm text-star">{t("ready", { attribute: title })}</p>
      <p className="text-sm">{t("preview", { values: preview })}</p>
      <p className="text-xs text-muted">{t("irreversible")}</p>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => run(() => unfoldAttribute(general))}>
          {t("unfold")}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => run(() => declineUnfold(general))}>
          {t("notNow")}
        </Button>
      </div>
    </Panel>
  );
}

/** Калибровка после раскрытия: 2 очка между тремя новыми характеристиками. */
export function UnfoldCalibration({
  general,
  keys,
  names,
  base,
  current,
  rules,
}: {
  general: string;
  keys: string[];
  names: Record<string, string>;
  base: number[];
  current: Record<string, number>;
  rules: { pointsTotal: number; min: number; max: number };
}) {
  const t = useTranslations("status.calibration");
  const { run, pending } = useSystem();
  const [values, setValues] = useState(current);
  const baseMap = Object.fromEntries(keys.map((k, i) => [k, base[i]]));
  const used = keys.reduce((s, k) => s + Math.max(0, values[k] - baseMap[k]), 0);
  const total = keys.reduce((s, k) => s + values[k], 0);
  const baseTotal = base.reduce((a, b) => a + b, 0);
  const adjust = (k: string, d: number) =>
    setValues((v) => {
      const n = v[k] + d;
      if (n < rules.min || n > rules.max) return v;
      const next = { ...v, [k]: n };
      const u = keys.reduce((s, x) => s + Math.max(0, next[x] - baseMap[x]), 0);
      return u > rules.pointsTotal ? v : next;
    });
  return (
    <Panel title={t("title")} className="space-y-3">
      <p className="text-xs text-muted">{t("hint", { points: rules.pointsTotal - used })}</p>
      <ul className="space-y-2">
        {keys.map((k) => (
          <li key={k} className="flex items-center justify-between">
            <span>{names[k]}</span>
            <span className="flex items-center gap-2">
              <button type="button" className="h-9 w-9 rounded-lg border border-panel-border" aria-label={t("minus", { attr: names[k] })} onClick={() => adjust(k, -1)}>
                −
              </button>
              <span className="w-8 text-center font-mono text-xl">{values[k]}</span>
              <button type="button" className="h-9 w-9 rounded-lg border border-panel-border" aria-label={t("plus", { attr: names[k] })} onClick={() => adjust(k, 1)}>
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <Button
        className="w-full"
        disabled={pending || total !== baseTotal}
        onClick={() =>
          run(async () => {
            if (keys.some((k) => values[k] !== current[k])) {
              const r = await calibrate({ kind: "unfold", general: general as "body", values });
              if (r.error) return r;
            }
            return finishCalibration({ kind: "unfold", general });
          })
        }
      >
        {t("done")}
      </Button>
    </Panel>
  );
}

"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  addSleepingSkill,
  calibrate,
  finishCalibration,
  finishOnboarding,
  removeSleepingSkill,
  runAssessment,
  saveOnboardingAnswers,
  takeStarterSkills,
} from "@/app/actions/onboarding";
import { AvatarEditor } from "@/components/game/avatar-editor";
import { useSystem } from "@/components/game/system-messages";
import { Button, Chip, Panel, cn } from "@/components/ui/primitives";
import { GENERAL_KEYS, PART_KEYS, type AttributeKey, type GeneralKey, type PartKey } from "@/lib/game/attributes";
import type { AvatarConfig } from "@/lib/game/avatar";
import { mainSlots, secondarySlots } from "@/lib/game/formulas";
import {
  AGE_BANDS,
  estimatePastHours,
  GOALS,
  CATEGORIES,
  GROUPS,
  OCCUPATIONS,
  PRESET_SKILLS,
  suggestedSkills,
  targetLevelForHours,
  type AssessmentReason,
  type Locale,
} from "@/lib/game/onboarding";

export interface WizardData {
  locale: Locale;
  answers: {
    ageBand: string | null;
    occupations: string[];
    groups: string[];
    goals: string[];
    otherGroup: string;
  };
  sleeping: { id: string; name: string; hours: number; target: number; removable: boolean }[];
  takenNames: string[];
  assessed: boolean;
  reasons: Record<string, AssessmentReason[]> | null;
  values: Record<GeneralKey, number>;
  calibration: {
    base: number[];
    keys: AttributeKey[];
    closed: boolean;
    rules: { pointsTotal: number; min: number; max: number };
  } | null;
  gameName: string;
  avatar: AvatarConfig;
}

const STEPS = ["age", "occupation", "groups", "skills", "goals", "starter", "assessment", "name"] as const;
type Step = (typeof STEPS)[number];

const ATTR_COLOR: Record<GeneralKey, string> = {
  body: "var(--attr-body)",
  mind: "var(--attr-mind)",
  spirit: "var(--attr-spirit)",
};

export function OnboardingWizard({ data }: { data: WizardData }) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const { run, pending } = useSystem();
  const [step, setStep] = useState<Step>(data.assessed ? "assessment" : "age");
  const [answers, setAnswers] = useState(data.answers);
  const loc = data.locale;
  const label = (o: { ru: string; en: string }) => (loc === "en" ? o.en : o.ru);
  const idx = STEPS.indexOf(step);

  const saveAnswers = async () => {
    await saveOnboardingAnswers({
      ...answers,
      ageBand: answers.ageBand,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  const next = async () => {
    if (idx <= STEPS.indexOf("goals")) await saveAnswers();
    setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  };
  const back = () => setStep(STEPS[Math.max(idx - 1, 0)]);

  const toggle = (key: "occupations" | "groups" | "goals", v: string, max: number) =>
    setAnswers((a) => {
      const has = a[key].includes(v);
      if (!has && a[key].length >= max) return a;
      return { ...a, [key]: has ? a[key].filter((x) => x !== v) : [...a[key], v] };
    });

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          {t("progress", { step: idx + 1, total: STEPS.length })}
        </p>
        <h1 className="text-xl font-semibold">{t(`${step}.title`)}</h1>
        <p className="text-sm text-muted">{t(`${step}.hint`)}</p>
      </header>

      {step === "age" && (
        <div className="flex flex-wrap gap-2">
          {AGE_BANDS.map((b) => (
            <Chip key={b} selected={answers.ageBand === b} onClick={() => setAnswers((a) => ({ ...a, ageBand: b }))}>
              {b}
            </Chip>
          ))}
        </div>
      )}

      {step === "occupation" && (
        <div className="flex flex-wrap gap-2">
          {OCCUPATIONS.map((o) => (
            <Chip key={o.key} selected={answers.occupations.includes(o.key)} onClick={() => toggle("occupations", o.key, 8)}>
              {label(o)}
            </Chip>
          ))}
        </div>
      )}

      {step === "groups" && <GroupsStep answers={answers} setAnswers={setAnswers} toggle={toggle} loc={loc} />}

      {step === "skills" && <SleepingStep data={data} />}

      {step === "goals" && (
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <Chip key={g.key} selected={answers.goals.includes(g.key)} onClick={() => toggle("goals", g.key, 3)}>
              {label(g)}
            </Chip>
          ))}
        </div>
      )}

      {step === "starter" && <StarterStep data={data} groups={answers.groups} ageBand={answers.ageBand} onDone={next} />}

      {step === "assessment" && (
        <AssessmentStep
          key={`${data.assessed}:${GENERAL_KEYS.map((g) => data.values[g]).join(",")}`}
          data={data}
          onDone={next}
        />
      )}

      {step === "name" && <NameStep initial={data.gameName} />}

      {step !== "starter" && step !== "assessment" && step !== "name" && (
        <footer className="flex gap-2 pt-2">
          {idx > 0 && (
            <Button variant="ghost" onClick={back}>
              {t("back")}
            </Button>
          )}
          <Button className="flex-1" onClick={() => run(async () => (await next(), { messages: [] }))} disabled={pending}>
            {t("next")}
          </Button>
          <Button variant="ghost" onClick={() => setStep(STEPS[idx + 1])}>
            {t("skip")}
          </Button>
        </footer>
      )}
    </div>
  );

  function NameStep({ initial }: { initial: string }) {
    const [name, setName] = useState(initial);
    const [avatar, setAvatar] = useState<AvatarConfig>(data.avatar);
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => finishOnboarding({ gameName: name.trim() || t("name.default"), avatar }));
          if (r && !r.error) router.push("/");
        }}
      >
        <Panel>
          <AvatarEditor value={avatar} onChange={setAvatar} />
        </Panel>
        <label className="block space-y-2">
          <span className="text-sm">{t("name.label")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={t("name.placeholder")}
            className="w-full rounded-xl border border-panel-border bg-black/30 px-3 py-3 outline-none focus:border-accent"
          />
        </label>
        <Button type="submit" className="w-full" disabled={pending}>
          {t("name.finish")}
        </Button>
      </form>
    );
  }
}

function GroupsStep({
  answers,
  setAnswers,
  toggle,
  loc,
}: {
  answers: WizardData["answers"];
  setAnswers: (f: (a: WizardData["answers"]) => WizardData["answers"]) => void;
  toggle: (key: "groups", v: string, max: number) => void;
  loc: Locale;
}) {
  const t = useTranslations("onboarding");
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const shown = GROUPS.filter((g) => (loc === "en" ? g.en : g.ru).toLowerCase().includes(ql));
  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("groups.search")}
        aria-label={t("groups.search")}
        className="w-full rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
      />
      {CATEGORIES.map((c) => {
        const list = shown.filter((g) => g.category === c.key);
        if (list.length === 0) return null;
        return (
          <section key={c.key} className="space-y-2">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{loc === "en" ? c.en : c.ru}</h2>
            <div className="flex flex-wrap gap-2">
              {list.map((g) => (
                <Chip key={g.key} selected={answers.groups.includes(g.key)} onClick={() => toggle("groups", g.key, 6)}>
                  {loc === "en" ? g.en : g.ru}
                </Chip>
              ))}
            </div>
          </section>
        );
      })}
      <input
        value={answers.otherGroup}
        onChange={(e) => setAnswers((a) => ({ ...a, otherGroup: e.target.value }))}
        placeholder={t("groups.other")}
        aria-label={t("groups.other")}
        maxLength={120}
        className="w-full rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
      />
    </div>
  );
}

function AttrPicker({
  value,
  onChange,
  label,
  allowNone,
}: {
  value: PartKey | null;
  onChange: (v: PartKey | null) => void;
  label: string;
  allowNone?: boolean;
}) {
  const tg = useTranslations("game");
  const t = useTranslations("onboarding");
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {allowNone && (
          <Chip selected={value === null} onClick={() => onChange(null)}>
            {t("skills.none")}
          </Chip>
        )}
        {PART_KEYS.map((p) => (
          <Chip key={p} selected={value === p} onClick={() => onChange(p)} className="text-xs">
            {tg(`attributes.${p}`)}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

function SleepingStep({ data }: { data: WizardData }) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const { run, pending } = useSystem();
  const [name, setName] = useState("");
  const [years, setYears] = useState(2);
  const [times, setTimes] = useState(2);
  const [hoursPer, setHoursPer] = useState(1);
  const [primary, setPrimary] = useState<PartKey | null>(null);
  const [secondary, setSecondary] = useState<PartKey | null>(null);
  const hours = estimatePastHours(years, times, hoursPer);
  const valid = name.trim().length >= 2 && primary && hours > 0;

  const num = (v: number, set: (n: number) => void, labelKey: string, step: number, max: number) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {t(labelKey)}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step={step}
        value={v}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full rounded-lg border border-panel-border bg-black/30 px-2 py-2 text-base text-foreground outline-none focus:border-accent"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      {data.sleeping.length > 0 && (
        <ul className="space-y-2">
          {data.sleeping.map((s) => (
            <li key={s.id} className="system-panel flex items-center justify-between gap-2 p-3 opacity-80">
              <div>
                <p>{s.name}</p>
                <p className="font-mono text-xs text-muted">
                  {t("skills.sleepingLine", { hours: Math.round(s.hours), level: s.target })}
                </p>
              </div>
              {s.removable && (
                <Button
                  variant="ghost"
                  aria-label={t("skills.remove", { name: s.name })}
                  onClick={() => run(async () => (await removeSleepingSkill(s.id), router.refresh(), { messages: [] }))}
                >
                  ✕
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Panel title={t("skills.add")}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            run(async () => {
              await addSleepingSkill({ name: name.trim(), hours, primary: primary!, secondary });
              setName("");
              setPrimary(null);
              setSecondary(null);
              router.refresh();
              return { messages: [] };
            });
          }}
        >
          <label className="block space-y-1">
            <span className="text-sm">{t("skills.name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={t("skills.namePlaceholder")}
              className="w-full rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <p className="text-xs text-muted">{t("skills.broad")}</p>
          <div className="grid grid-cols-3 gap-2">
            {num(years, setYears, "skills.years", 0.5, 80)}
            {num(times, setTimes, "skills.perWeek", 0.5, 14)}
            {num(hoursPer, setHoursPer, "skills.hoursPer", 0.25, 12)}
          </div>
          <p className="font-mono text-sm text-accent">
            {t("skills.estimate", { hours, level: targetLevelForHours(hours) })}
          </p>
          <AttrPicker value={primary} onChange={setPrimary} label={t("skills.primary")} />
          <AttrPicker value={secondary} onChange={setSecondary} label={t("skills.secondary")} allowNone />
          <Button type="submit" variant="outline" className="w-full" disabled={!valid || pending}>
            {t("skills.addButton")}
          </Button>
        </form>
      </Panel>
    </div>
  );
}

function StarterStep({
  data,
  groups,
  ageBand,
  onDone,
}: {
  data: WizardData;
  groups: string[];
  ageBand: string | null;
  onDone: () => void;
}) {
  const t = useTranslations("onboarding");
  const tg = useTranslations("game");
  const { run, pending } = useSystem();
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Record<string, "main" | "secondary">>({});
  const suggested = useMemo(() => suggestedSkills(groups, ageBand), [groups, ageBand]);
  const en = data.locale === "en";
  const ql = q.trim().toLowerCase();
  const all = showAll || suggested.length === 0 || ql.length > 0;
  const list = (all ? Object.values(PRESET_SKILLS) : suggested).filter(
    (s) =>
      !data.takenNames.includes((en ? s.en : s.ru).toLowerCase()) &&
      (!ql || `${en ? s.en : s.ru} ${en ? s.scope_en : s.scope_ru}`.toLowerCase().includes(ql)),
  );
  const raises = (s: (typeof list)[number]) =>
    [s.primary, s.secondary].filter(Boolean).map((k) => tg(`attributes.${k}`)).join(" · ");
  const sections = all
    ? [...new Set(list.map((s) => s.domain))].map((d) => ({ title: tg(`domains.${d}`), items: list.filter((s) => s.domain === d) }))
    : [{ title: "", items: list }];
  const count = (slot: "main" | "secondary") => Object.values(pick).filter((v) => v === slot).length;
  const maxMain = mainSlots(1);
  const maxSecondary = secondarySlots(1);

  const cycle = (key: string) =>
    setPick((p) => {
      const cur = p[key];
      const next = { ...p };
      if (!cur) {
        if (count("main") < maxMain) next[key] = "main";
        else if (count("secondary") < maxSecondary) next[key] = "secondary";
      } else if (cur === "main" && count("secondary") < maxSecondary) next[key] = "secondary";
      else delete next[key];
      return next;
    });

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-muted">
        {t("starter.counter", { main: count("main"), maxMain, secondary: count("secondary"), maxSecondary })}
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("starter.search")}
        aria-label={t("starter.search")}
        className="w-full rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
      />
      {sections.map((sec) => (
        <section key={sec.title || "suggested"} className="space-y-2">
          {sec.title && <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{sec.title}</h2>}
          <ul className="space-y-2">
            {sec.items.map((s) => {
              const slot = pick[s.key];
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => cycle(s.key)}
                    aria-pressed={Boolean(slot)}
                    className={cn(
                      "system-panel flex w-full items-center justify-between gap-3 p-3 text-left",
                      slot && "border-accent",
                    )}
                  >
                    <span>
                      <span className="block">{en ? s.en : s.ru}</span>
                      <span className="block text-xs text-muted">{en ? s.scope_en : s.scope_ru}</span>
                      <span className="mt-0.5 block text-xs text-accent/80">{t("starter.raises", { attrs: raises(s) })}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-accent">{slot ? t(`starter.${slot}`) : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!all && (
        <Button variant="ghost" onClick={() => setShowAll(true)}>
          {t("starter.showAll")}
        </Button>
      )}
      <footer className="flex gap-2">
        <Button
          className="flex-1"
          disabled={pending}
          onClick={() =>
            run(async () => {
              await takeStarterSkills({
                main: Object.keys(pick).filter((k) => pick[k] === "main"),
                secondary: Object.keys(pick).filter((k) => pick[k] === "secondary"),
              });
              onDone();
              return { messages: [] };
            })
          }
        >
          {t("next")}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t("skip")}
        </Button>
      </footer>
    </div>
  );
}

function AssessmentStep({ data, onDone }: { data: WizardData; onDone: () => void }) {
  const t = useTranslations("onboarding");
  const tg = useTranslations("game");
  const router = useRouter();
  const reduce = useReducedMotion();
  const { run, pending } = useSystem();
  const cal = data.calibration;
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(GENERAL_KEYS.map((g) => [g, data.values[g]])),
  );

  if (!data.assessed) {
    return (
      <div className="space-y-4">
        <Button
          className="w-full"
          disabled={pending}
          onClick={() => run(async () => (await runAssessment(), router.refresh(), { messages: [] }))}
        >
          {t("assessment.run")}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onDone}>
          {t("skip")}
        </Button>
      </div>
    );
  }

  const base = cal ? Object.fromEntries(cal.keys.map((k, i) => [k, cal.base[i]])) : values;
  const used = GENERAL_KEYS.reduce((s, g) => s + Math.max(0, values[g] - (base[g] ?? values[g])), 0);
  const left = cal && !cal.closed ? cal.rules.pointsTotal - used : 0;
  const total = GENERAL_KEYS.reduce((s, g) => s + values[g], 0);
  const baseTotal = GENERAL_KEYS.reduce((s, g) => s + (base[g] ?? 0), 0);

  const adjust = (g: GeneralKey, d: 1 | -1) =>
    setValues((v) => {
      if (!cal) return v;
      const nextV = v[g] + d;
      if (nextV < cal.rules.min || nextV > cal.rules.max) return v;
      const next = { ...v, [g]: nextV };
      const nextUsed = GENERAL_KEYS.reduce((s, k) => s + Math.max(0, next[k] - base[k]), 0);
      return nextUsed > cal.rules.pointsTotal ? v : next;
    });

  return (
    <div className="space-y-4">
      <p className="font-mono text-sm text-accent">{t("assessment.done")}</p>
      <ul className="space-y-3">
        {GENERAL_KEYS.map((g, i) => (
          <motion.li
            key={g}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.4 + i * 0.6 }}
            className="system-panel p-4"
            style={{ borderColor: ATTR_COLOR[g] }}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium" style={{ color: ATTR_COLOR[g] }}>
                {tg(`attributes.${g}`)}
              </span>
              <span className="flex items-center gap-2">
                {cal && !cal.closed && (
                  <button
                    type="button"
                    className="h-9 w-9 rounded-lg border border-panel-border"
                    aria-label={t("assessment.minus", { attr: tg(`attributes.${g}`) })}
                    onClick={() => adjust(g, -1)}
                  >
                    −
                  </button>
                )}
                <span className="w-8 text-center font-mono text-2xl">{values[g]}</span>
                {cal && !cal.closed && (
                  <button
                    type="button"
                    className="h-9 w-9 rounded-lg border border-panel-border"
                    aria-label={t("assessment.plus", { attr: tg(`attributes.${g}`) })}
                    onClick={() => adjust(g, 1)}
                  >
                    +
                  </button>
                )}
              </span>
            </div>
            <p className="mt-1 text-xs">{tg(`attrInfo.${g}.about`)}</p>
            <p className="mt-1 text-xs text-muted">
              {t("assessment.because")}{" "}
              {(data.reasons?.[g] ?? []).map((r) => r.label).join(" · ") || t("assessment.base")}
            </p>
          </motion.li>
        ))}
      </ul>
      {cal && !cal.closed && (
        <p className="text-sm text-muted">
          {total !== baseTotal ? t("assessment.balance") : t("assessment.calibrate", { left })}
        </p>
      )}
      <Button
        className="w-full"
        disabled={pending || total !== baseTotal}
        onClick={() =>
          run(async () => {
            if (cal && !cal.closed) {
              const changed = GENERAL_KEYS.some((g) => values[g] !== base[g]);
              if (changed) {
                const r = await calibrate({ kind: "start", values });
                if (r.error) return r;
              }
              await finishCalibration({ kind: "start" });
            }
            onDone();
            return { messages: [] };
          })
        }
      >
        {t("assessment.confirm")}
      </Button>
    </div>
  );
}

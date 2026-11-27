"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteMeasurement, recordMeasurement } from "@/app/actions/measurements";
import { Button, cn } from "@/components/ui/primitives";
import { CEFR, SCALE_KEYS, SCALES, type ScaleKey, type Trend } from "@/lib/game/measurements";

export interface MeasurementView {
  id: string;
  scale: ScaleKey;
  text: string;
  unit: string | null;
  date: string;
  note: string | null;
  trend: Trend;
}

const TREND = { better: "↑", worse: "↓", same: "=" } as const;

/**
 * Замер навыка (фаза 3d): последний результат по внешней шкале и форма нового замера.
 * Замер может понизиться — это информация, а не штраф; на опыт не влияет.
 */
export function SkillMeasurement({ skillId, latest, today }: { skillId: string; latest: MeasurementView | null; today: string }) {
  const t = useTranslations("measure");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState<ScaleKey>(latest?.scale ?? "cefr");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState(latest?.unit ?? "");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const def = SCALES[scale];

  const save = () =>
    start(async () => {
      setError(null);
      const r = await recordMeasurement({ skillId, scale, value, unit: unit || null, measuredOn: date, note: note || null });
      if (r.error) setError(tc(`errors.${r.error}`));
      else {
        setOpen(false);
        setValue("");
        setNote("");
        router.refresh();
      }
    });

  const input = "rounded-lg border border-panel-border bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-accent";

  return (
    <div className="space-y-2">
      {latest && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-star/40 bg-star/5 px-2 py-1.5">
          <span className="min-w-0 text-xs">
            <span className="text-muted">{t(`scale.${latest.scale}`)}: </span>
            <span className="font-mono text-star">
              {latest.text}
              {latest.unit ? ` ${latest.unit}` : ""}
            </span>
            {latest.trend && (
              <span
                className={cn("ml-1 font-mono", latest.trend === "better" ? "text-accent" : "text-muted")}
                aria-label={t(`trend.${latest.trend}`)}
              >
                {TREND[latest.trend]}
              </span>
            )}
            <span className="text-muted"> · {t("lastMeasured", { date: latest.date })}</span>
            {latest.note && <span className="block truncate text-muted">{latest.note}</span>}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm(t("deleteConfirm")) && start(async () => (await deleteMeasurement(latest.id), router.refresh()))}
            className="shrink-0 text-[10px] text-muted underline underline-offset-2 hover:text-hp"
          >
            {t("delete")}
          </button>
        </div>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted underline underline-offset-4 hover:text-accent">
          {t("add")}
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-panel-border p-2">
          <p className="text-xs text-muted">{t("about")}</p>
          <div className="flex flex-wrap gap-2">
            <select
              value={scale}
              onChange={(e) => {
                setScale(e.target.value as ScaleKey);
                setValue("");
              }}
              aria-label={t("scaleLabel")}
              className={input}
            >
              {SCALE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`scale.${k}`)}
                </option>
              ))}
            </select>
            {def.kind === "ordinal" ? (
              <select value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("value")} className={input}>
                <option value="">—</option>
                {CEFR.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode={def.kind === "number" ? "decimal" : "text"}
                placeholder={t(`placeholder.${scale}`)}
                aria-label={t("value")}
                className={cn(input, "w-28 font-mono")}
              />
            )}
            {def.kind === "number" && def.customUnit && (
              <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder={t("unit")} aria-label={t("unit")} className={cn(input, "w-24")} />
            )}
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label={t("date")} className={input} />
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder={t("note")}
            aria-label={t("note")}
            className={cn(input, "w-full")}
          />
          <div className="flex gap-2">
            <Button disabled={pending || !value.trim()} onClick={save}>
              {t("save")}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-hp">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

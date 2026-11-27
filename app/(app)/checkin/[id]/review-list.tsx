"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { confirmCheckin, splitDraft, updateDraft } from "@/app/actions/checkin";
import { confirmEntry, deleteEntry } from "@/app/actions/log";
import { useSystem } from "@/components/game/system-messages";
import { Button, Chip, Panel, cn } from "@/components/ui/primitives";

export interface ReviewDraft {
  id: string;
  description: string;
  quote: string;
  minutes: number;
  intensity: number;
  novelty: number;
  isRest: boolean;
  confidence: number;
  skills: { name: string; share: number; isNew: boolean }[];
  merge: { description: string; minutes: number } | null;
}

const INTENSITIES = [
  { v: 0.5, k: "light" },
  { v: 1, k: "normal" },
  { v: 1.3, k: "hard" },
  { v: 1.6, k: "max" },
] as const;

export function ReviewList({ checkinId, drafts }: { checkinId: string; drafts: ReviewDraft[] }) {
  const t = useTranslations("checkin");
  const tl = useTranslations("log");
  const router = useRouter();
  const { run, pending } = useSystem();

  if (drafts.length === 0) {
    return (
      <Panel>
        <p className="text-sm text-muted">{t("noDrafts")}</p>
      </Panel>
    );
  }

  const nearest = (x: number) => INTENSITIES.reduce((a, b) => (Math.abs(b.v - x) < Math.abs(a.v - x) ? b : a)).v;

  return (
    <div className="space-y-3">
      {drafts.map((d) => (
        <Panel key={d.id} className={cn("space-y-3", d.confidence < 0.5 && "border-star/60")}>
          <div className="space-y-1">
            <p className="text-sm">{d.description}</p>
            {d.quote && <p className="text-xs italic text-muted">«{d.quote}»</p>}
            {d.confidence < 0.5 && <p className="text-xs text-star">{t("lowConfidence")}</p>}
            {d.merge && (
              <p className="text-xs text-accent">
                {t("merge", { description: d.merge.description, from: d.merge.minutes, to: d.minutes })}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t("less")}
              disabled={pending || d.minutes <= 15}
              onClick={() => run(() => updateDraft({ id: d.id, minutes: Math.max(1, d.minutes - 15) }).then((r) => (router.refresh(), r)))}
              className="h-10 w-10 rounded-lg border border-panel-border disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-20 text-center font-mono">{t("minutes", { n: d.minutes })}</span>
            <button
              type="button"
              aria-label={t("more")}
              disabled={pending || d.minutes >= 945}
              onClick={() => run(() => updateDraft({ id: d.id, minutes: d.minutes + 15 }).then((r) => (router.refresh(), r)))}
              className="h-10 w-10 rounded-lg border border-panel-border disabled:opacity-40"
            >
              +
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {INTENSITIES.map((i) => (
              <Chip
                key={i.k}
                selected={nearest(d.intensity) === i.v}
                disabled={pending}
                className="text-xs"
                onClick={() => run(() => updateDraft({ id: d.id, intensity: i.v }).then((r) => (router.refresh(), r)))}
              >
                {tl(`intensity.${i.k}`)}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {d.skills.map((s) => (
              <span
                key={s.name}
                className={cn("rounded-full border px-2 py-0.5 text-xs", s.isNew ? "border-dashed border-accent/60" : "border-panel-border")}
              >
                {s.isNew && `${t("newSkill")} `}
                {s.name}
                {s.share < 1 && ` ${Math.round(s.share * 100)}%`}
              </span>
            ))}
            <Chip
              selected={d.isRest}
              disabled={pending}
              className="text-xs"
              onClick={() => run(() => updateDraft({ id: d.id, isRest: !d.isRest }).then((r) => (router.refresh(), r)))}
            >
              {tl("rest")}
            </Chip>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run(() => confirmEntry(d.id).then((r) => (router.refresh(), r)))}>
              {t("confirm")}
            </Button>
            <Button variant="outline" disabled={pending || d.minutes < 2} onClick={() => run(() => splitDraft(d.id).then((r) => (router.refresh(), r)))}>
              {t("split")}
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => run(() => deleteEntry(d.id).then((r) => (router.refresh(), r)))}>
              {t("delete")}
            </Button>
          </div>
        </Panel>
      ))}

      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const r = await confirmCheckin(checkinId);
            router.push("/");
            return r;
          })
        }
      >
        {t("confirmAll", { n: drafts.length })}
      </Button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { logActivity } from "@/app/actions/log";
import { useSystem } from "@/components/game/system-messages";
import { Chip, Panel } from "@/components/ui/primitives";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240] as const;
const INTENSITIES = [
  { value: 0.5, key: "light" },
  { value: 1, key: "normal" },
  { value: 1.3, key: "hard" },
  { value: 1.6, key: "max" },
] as const;

interface SkillOption {
  id: string;
  name: string;
  isRest: boolean;
}

/**
 * Быстрый лог (SPEC 4.3): навык → длительность → интенсивность. Тап по интенсивности сохраняет запись.
 */
export function LogForm({ skills, candidates }: { skills: SkillOption[]; candidates: string[] }) {
  const t = useTranslations("log");
  const router = useRouter();
  const { run, pending } = useSystem();
  const [query, setQuery] = useState("");
  const [skillId, setSkillId] = useState<string | null>(null);
  const [newActivity, setNewActivity] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [novelty, setNovelty] = useState(1);
  const [isRest, setIsRest] = useState(false);
  const [description, setDescription] = useState("");

  const q = query.trim().toLowerCase();
  const shown = (q ? skills.filter((s) => s.name.toLowerCase().includes(q)) : skills).slice(0, 12);
  const shownCandidates = (q ? candidates.filter((c) => c.toLowerCase().includes(q)) : candidates).slice(0, 6);
  const exact = skills.some((s) => s.name.toLowerCase() === q) || candidates.some((c) => c.toLowerCase() === q);
  const chosen = skillId ? skills.find((s) => s.id === skillId)?.name : newActivity;

  const save = (intensity: number) => {
    const m = minutes ?? Number(custom);
    if (!chosen || !m) return;
    run(async () => {
      const r = await logActivity({
        skillId,
        newActivity: skillId ? null : newActivity,
        minutes: Math.round(m),
        intensity,
        novelty,
        day,
        isRest,
        description: description.trim() || undefined,
      });
      if (!r.error) router.push("/");
      return r;
    });
  };

  return (
    <div className="space-y-4">
      <Panel title={t("step1")}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="mb-3 w-full rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          {shown.map((s) => (
            <Chip
              key={s.id}
              selected={skillId === s.id}
              onClick={() => {
                setSkillId(s.id);
                setNewActivity(null);
                setIsRest(s.isRest);
              }}
            >
              {s.name}
            </Chip>
          ))}
          {shownCandidates.map((c) => (
            <Chip
              key={`cand:${c}`}
              selected={newActivity === c}
              className="border-dashed"
              onClick={() => {
                setNewActivity(c);
                setSkillId(null);
              }}
            >
              {c}
            </Chip>
          ))}
          {q.length >= 2 && !exact && (
            <Chip
              selected={newActivity === query.trim()}
              onClick={() => {
                setNewActivity(query.trim());
                setSkillId(null);
              }}
            >
              {t("new", { name: query.trim() })}
            </Chip>
          )}
        </div>
        {skills.length === 0 && !q && <p className="text-sm text-muted">{t("noSkills")}</p>}
        <p className="mt-2 text-xs text-muted">{t("newHint")}</p>
      </Panel>

      <Panel title={t("step2")}>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <Chip key={d} selected={minutes === d} onClick={() => setMinutes(d)} className="font-mono">
              {d < 60 ? t("min", { n: d }) : t("hours", { n: d / 60 })}
            </Chip>
          ))}
          <input
            inputMode="numeric"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value.replace(/\D/g, ""));
              setMinutes(null);
            }}
            placeholder={t("customMin")}
            aria-label={t("customMin")}
            className="w-24 rounded-full border border-panel-border bg-black/30 px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <p className="mt-2 text-xs text-muted">{t("focusHint")}</p>
      </Panel>

      <Panel title={t("step3")}>
        <div className="grid grid-cols-2 gap-2">
          {INTENSITIES.map((i) => (
            <button
              key={i.key}
              type="button"
              disabled={pending || !chosen || !(minutes ?? Number(custom))}
              onClick={() => save(i.value)}
              className="min-h-14 rounded-xl border border-panel-border px-3 py-2 text-left text-sm transition hover:border-accent disabled:opacity-40"
            >
              <span className="block">{t(`intensity.${i.key}`)}</span>
              <span className="block font-mono text-xs text-muted">×{i.value}</span>
            </button>
          ))}
        </div>
      </Panel>

      <details className="system-panel p-4">
        <summary className="cursor-pointer text-sm text-muted">{t("more")}</summary>
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <Chip selected={day === "today"} onClick={() => setDay("today")}>
              {t("today")}
            </Chip>
            <Chip selected={day === "yesterday"} onClick={() => setDay("yesterday")}>
              {t("yesterday")}
            </Chip>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { v: 0.9, k: "routine" },
              { v: 1, k: "usual" },
              { v: 1.2, k: "new" },
            ].map((n) => (
              <Chip key={n.k} selected={novelty === n.v} onClick={() => setNovelty(n.v)}>
                {t(`novelty.${n.k}`)}
              </Chip>
            ))}
          </div>
          <Chip selected={isRest} onClick={() => setIsRest((v) => !v)}>
            {t("rest")}
          </Chip>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder={t("description")}
            aria-label={t("description")}
            className="w-full rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
          />
        </div>
      </details>
    </div>
  );
}

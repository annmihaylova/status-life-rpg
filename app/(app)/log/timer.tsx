"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { logTimer } from "@/app/actions/log";
import { useSystem } from "@/components/game/system-messages";
import { Button, Chip, Panel } from "@/components/ui/primitives";

interface Running {
  skillId: string;
  name: string;
  startedAt: string;
}

const KEY = "status.timer";
const EVENT = "status-timer";

/** Таймер живёт в localStorage: переживает перезагрузку и закрытие вкладки. */
function read(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}
function write(v: Running | null) {
  if (v) window.localStorage.setItem(KEY, JSON.stringify(v));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}
function parse(raw: string | null): Running | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Running;
    return v.skillId && v.startedAt ? v : null;
  } catch {
    return null;
  }
}

const INTENSITIES = [
  { value: 0.5, key: "light" },
  { value: 1, key: "normal" },
  { value: 1.3, key: "hard" },
  { value: 1.6, key: "max" },
] as const;

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Таймер (SPEC 4.3): старт/стоп для текущей активности, в конце — вопрос,
 * сколько из этого времени было в фокусе (по умолчанию 85%).
 */
export function Timer({ skills }: { skills: { id: string; name: string }[] }) {
  const t = useTranslations("timer");
  const tl = useTranslations("log");
  const router = useRouter();
  const { run, pending } = useSystem();
  const running = parse(useSyncExternalStore(subscribe, read, () => null));
  const [skillId, setSkillId] = useState<string | null>(null);
  const [stoppedAt, setStoppedAt] = useState<string | null>(null);
  const [percent, setPercent] = useState(85);
  const [novelty, setNovelty] = useState(1);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || stoppedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, stoppedAt]);

  if (!running) {
    return (
      <Panel title={t("title")}>
        <p className="mb-3 text-sm text-muted">{t("hint")}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {skills.slice(0, 12).map((s) => (
            <Chip key={s.id} selected={skillId === s.id} onClick={() => setSkillId(s.id)}>
              {s.name}
            </Chip>
          ))}
        </div>
        {skills.length === 0 && <p className="mb-3 text-sm text-muted">{t("noSkills")}</p>}
        <Button
          className="w-full"
          disabled={!skillId}
          onClick={() => {
            const s = skills.find((x) => x.id === skillId);
            if (!s) return;
            setStoppedAt(null);
            setNow(Date.now());
            write({ skillId: s.id, name: s.name, startedAt: new Date().toISOString() });
          }}
        >
          {t("start")}
        </Button>
      </Panel>
    );
  }

  const end = stoppedAt ? new Date(stoppedAt).getTime() : now;
  const elapsedMs = end - new Date(running.startedAt).getTime();
  const elapsedMin = Math.round(elapsedMs / 60_000);
  const focusMin = Math.round((elapsedMin * percent) / 100);

  if (!stoppedAt) {
    return (
      <Panel title={t("title")}>
        <p className="text-sm">{running.name}</p>
        <p className="my-4 text-center font-mono text-4xl tabular-nums text-accent" role="timer" aria-live="off">
          {clock(elapsedMs)}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => write(null)}>
            {t("cancel")}
          </Button>
          <Button className="flex-1" onClick={() => setStoppedAt(new Date().toISOString())}>
            {t("stop")}
          </Button>
        </div>
      </Panel>
    );
  }

  const save = (intensity: number) =>
    run(async () => {
      const r = await logTimer({
        skillId: running.skillId,
        startedAt: running.startedAt,
        endedAt: stoppedAt,
        focusPercent: percent,
        intensity,
        novelty,
      });
      if (!r.error) {
        write(null);
        setStoppedAt(null);
        router.push("/");
      }
      return r;
    });

  return (
    <Panel title={t("title")} className="space-y-4">
      <p className="text-sm">
        {running.name}: <span className="font-mono">{t("elapsed", { minutes: elapsedMin })}</span>
      </p>
      {elapsedMin < 1 ? (
        <p className="text-sm text-hp">{t("tooShort")}</p>
      ) : (
        <>
          <label className="block space-y-2">
            <span className="block text-sm">{t("focusQuestion")}</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <span className="block font-mono text-xs text-muted">{t("focusValue", { percent, minutes: focusMin })}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { v: 0.9, k: "routine" },
              { v: 1, k: "usual" },
              { v: 1.2, k: "new" },
            ].map((n) => (
              <Chip key={n.k} selected={novelty === n.v} onClick={() => setNovelty(n.v)}>
                {tl(`novelty.${n.k}`)}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-muted">{tl("step3")}</p>
          <div className="grid grid-cols-2 gap-2">
            {INTENSITIES.map((i) => (
              <button
                key={i.key}
                type="button"
                disabled={pending}
                onClick={() => save(i.value)}
                className="min-h-14 rounded-xl border border-panel-border px-3 py-2 text-left text-sm transition hover:border-accent disabled:opacity-40"
              >
                <span className="block">{tl(`intensity.${i.key}`)}</span>
                <span className="block font-mono text-xs text-muted">×{i.value}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setStoppedAt(null)}>
          {t("resume")}
        </Button>
        <Button variant="danger" className="flex-1" onClick={() => (write(null), setStoppedAt(null))}>
          {t("discard")}
        </Button>
      </div>
    </Panel>
  );
}

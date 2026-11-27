"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Chip } from "@/components/ui/primitives";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("status-timer", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("status-timer", cb);
  };
};

/** «Вручную» или «Таймер»; если таймер уже идёт, сразу показываем его. */
export function LogModes({ manual, timer }: { manual: ReactNode; timer: ReactNode }) {
  const t = useTranslations("log");
  const running = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem("status.timer") !== null,
    () => false,
  );
  const [choice, setChoice] = useState<"manual" | "timer" | null>(null);
  const mode = choice ?? (running ? "timer" : "manual");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Chip selected={mode === "manual"} onClick={() => setChoice("manual")}>
          {t("modeManual")}
        </Chip>
        <Chip selected={mode === "timer"} onClick={() => setChoice("timer")}>
          {running ? t("modeTimerRunning") : t("modeTimer")}
        </Chip>
      </div>
      {mode === "manual" ? manual : timer}
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Chip } from "@/components/ui/primitives";
import { BASE_MODELS, baseModelUrl, type Model3d } from "@/lib/game/avatar";
import { VrmViewerLazy } from "./portrait";

/**
 * Выбор внешности: 2D-портрет или 3D-модель (фаза 4). Базовые модели показываются как есть
 * (условия VRoidPreset: assets/avatars/LICENSES.md); своя модель — из VRoid Studio.
 */
export function ModelPicker({
  value,
  onChange,
  customUrl,
  uploader,
}: {
  value: Model3d;
  onChange: (v: Model3d) => void;
  /** подписанная ссылка на свою модель, если она загружена */
  customUrl: string | null;
  uploader?: React.ReactNode;
}) {
  const t = useTranslations("model3d");
  const [error, setError] = useState(false);
  const url = value?.source === "base" ? baseModelUrl(value.key) : value?.source === "custom" ? customUrl : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Chip selected={value === null} onClick={() => onChange(null)}>
          {t("mode2d")}
        </Chip>
        {BASE_MODELS.map((m) => (
          <Chip
            key={m.key}
            selected={value?.source === "base" && value.key === m.key}
            onClick={() => {
              setError(false);
              onChange({ source: "base", key: m.key });
            }}
          >
            {t(`base.${m.key}`)}
          </Chip>
        ))}
        {customUrl && value?.source !== "custom" && (
          <Chip onClick={() => onChange(customUrlToValue(customUrl))}>{t("custom")}</Chip>
        )}
        {value?.source === "custom" && <Chip selected>{t("custom")}</Chip>}
      </div>

      {url && (
        <div className="relative h-[420px] overflow-hidden rounded-2xl border border-panel-border bg-gradient-to-b from-accent/10 to-transparent">
          <VrmViewerLazy key={url} url={url} framing="full" label={t("viewer")} className="absolute inset-0" onError={() => setError(true)} />
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] text-muted">{t("rotateHint")}</p>
          {error && <p className="absolute inset-x-0 top-1/2 text-center text-sm text-hp">{t("loadFailed")}</p>}
        </div>
      )}
      {value?.source === "base" && <p className="text-xs text-muted">{t("baseNote")}</p>}
      {uploader}
    </div>
  );
}

/** Подписанная ссылка содержит путь в бакете: …/vrm-user/<user>/<file>.vrm?token=… */
function customUrlToValue(url: string): Model3d {
  const m = /vrm-user\/([0-9a-f-]{36}\/[0-9a-z-]{1,40}\.vrm)/.exec(url);
  return m ? { source: "custom", path: m[1] } : null;
}

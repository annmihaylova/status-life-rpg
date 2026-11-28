"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Avatar } from "@/components/game/avatar";
import type { AvatarConfig } from "@/lib/game/avatar";
import { hasWebGL } from "./webgl";

// three и WebGL — только в браузере
export const VrmViewerLazy = dynamic(() => import("./vrm-viewer").then((m) => m.VrmViewer), { ssr: false });

const KEY = (url: string) => `status.portrait:${url.split("?")[0]}`;
const subscribe = () => () => {};

/**
 * Портрет на «Статусе»: для 3D — снимок, сохранённый после первой загрузки модели
 * (SPEC 6.2: PNG-fallback, кэш), иначе 2D. Модель грузится один раз и только если снимка нет.
 */
export function Portrait({
  config,
  modelUrl,
  size,
  label,
}: {
  config: AvatarConfig;
  /** адрес VRM или null для 2D */
  modelUrl: string | null;
  size: number;
  label: string;
}) {
  const cached = useSyncExternalStore(
    subscribe,
    () => (modelUrl ? window.localStorage.getItem(KEY(modelUrl)) : null),
    () => null,
  );
  const [failed, setFailed] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setWebgl(hasWebGL()));
  }, []);

  const box = { width: size, height: size };
  const shot = fresh ?? cached;
  if (!modelUrl || failed || webgl === false) return <Avatar config={config} size={size} label={label} />;
  if (shot) {
    // eslint-disable-next-line @next/next/no-img-element -- data URL снимка, оптимизатор не нужен
    return <img src={shot} alt={label} width={size} height={size} className="rounded-[22%] bg-black/20 object-cover" />;
  }
  return (
    <div style={box} className="relative overflow-hidden rounded-[22%] bg-black/20">
      {webgl && (
        <VrmViewerLazy
          url={modelUrl}
          framing="bust"
          interactive={false}
          label={label}
          className="absolute inset-0"
          onError={() => setFailed(true)}
          onSnapshot={(png) => {
            try {
              window.localStorage.setItem(KEY(modelUrl), png);
            } catch {
              // место в хранилище кончилось — просто не кэшируем
            }
            setFresh(png);
          }}
        />
      )}
    </div>
  );
}

/** Сбросить снимок (после смены модели). */
export function forgetPortrait(url: string) {
  try {
    window.localStorage.removeItem(KEY(url));
  } catch {}
}

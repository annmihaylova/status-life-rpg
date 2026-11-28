"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Chip, cn } from "@/components/ui/primitives";
import {
  ACCESSORIES,
  AURA_COLORS,
  EXPRESSIONS,
  EYE_COLORS,
  EYE_SHAPES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_COLORS,
  OUTFITS,
  SKIN_TONES,
  type AvatarConfig,
} from "@/lib/game/avatar";
import { Avatar } from "./avatar";

const TABS = ["face", "hair", "eyes", "outfit", "extras"] as const;
type Tab = (typeof TABS)[number];

/** Редактор 2D-персонажа: живое превью и вкладки. Сохраняет родитель через onChange. */
export function AvatarEditor({ value, onChange }: { value: AvatarConfig; onChange: (v: AvatarConfig) => void }) {
  const t = useTranslations("avatar");
  const [tab, setTab] = useState<Tab>("face");
  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => onChange({ ...value, [k]: v });
  const toggleAccessory = (a: AvatarConfig["accessories"][number]) => {
    const has = value.accessories.includes(a);
    let next = has ? value.accessories.filter((x) => x !== a) : [...value.accessories, a];
    // взаимоисключающие пары
    if (!has && a === "glasses_round") next = next.filter((x) => x !== "glasses_square");
    if (!has && a === "glasses_square") next = next.filter((x) => x !== "glasses_round");
    if (!has && a === "cap") next = next.filter((x) => x !== "headband" && x !== "headphones");
    if (!has && (a === "headband" || a === "headphones")) next = next.filter((x) => x !== "cap");
    onChange({ ...value, accessories: next.slice(-4) });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Avatar config={value} size={220} label={t("preview")} />
      </div>

      <div role="tablist" aria-label={t("tabs")} className="flex gap-1 overflow-x-auto">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "min-h-10 shrink-0 rounded-lg px-3 text-sm",
              tab === k ? "bg-accent/15 text-foreground" : "text-muted",
            )}
          >
            {t(`tab.${k}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-4">
        {tab === "face" && (
          <>
            <Swatches label={t("skin")} colors={SKIN_TONES} value={value.skin} onPick={(v) => set("skin", v)} />
            <Options
              label={t("expression")}
              items={EXPRESSIONS}
              value={value.expression}
              render={(k) => t(`expressions.${k}`)}
              onPick={(v) => set("expression", v)}
            />
          </>
        )}
        {tab === "hair" && (
          <>
            <Options
              label={t("hairStyle")}
              items={HAIR_STYLES}
              value={value.hairStyle}
              render={(k) => t(`hairStyles.${k}`)}
              onPick={(v) => set("hairStyle", v)}
            />
            <Swatches label={t("hairColor")} colors={HAIR_COLORS} value={value.hairColor} onPick={(v) => set("hairColor", v)} />
          </>
        )}
        {tab === "eyes" && (
          <>
            <Options
              label={t("eyeShape")}
              items={EYE_SHAPES}
              value={value.eyeShape}
              render={(k) => t(`eyeShapes.${k}`)}
              onPick={(v) => set("eyeShape", v)}
            />
            <Swatches label={t("eyeColor")} colors={EYE_COLORS} value={value.eyeColor} onPick={(v) => set("eyeColor", v)} />
          </>
        )}
        {tab === "outfit" && (
          <>
            <Options
              label={t("outfit")}
              items={OUTFITS}
              value={value.outfit}
              render={(k) => t(`outfits.${k}`)}
              onPick={(v) => set("outfit", v)}
            />
            <Swatches label={t("outfitColor")} colors={OUTFIT_COLORS} value={value.outfitColor} onPick={(v) => set("outfitColor", v)} />
          </>
        )}
        {tab === "extras" && (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm">{t("accessories")}</legend>
              <div className="flex flex-wrap gap-2">
                {ACCESSORIES.map((a) => (
                  <Chip key={a} selected={value.accessories.includes(a)} onClick={() => toggleAccessory(a)}>
                    {t(`accessoryNames.${a}`)}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <Swatches label={t("aura")} colors={AURA_COLORS} value={value.aura} onPick={(v) => set("aura", v)} />
          </>
        )}
      </div>
    </div>
  );
}

function Swatches({
  label,
  colors,
  value,
  onPick,
}: {
  label: string;
  colors: readonly string[];
  value: string;
  onPick: (v: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${label} ${c}`}
            aria-pressed={value === c}
            onClick={() => onPick(c)}
            className={cn(
              "h-10 w-10 rounded-full border-2 transition",
              value === c ? "scale-110 border-foreground" : "border-transparent",
            )}
            style={{ background: c, boxShadow: value === c ? `0 0 12px ${c}` : undefined }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Options<T extends string>({
  label,
  items,
  value,
  render,
  onPick,
}: {
  label: string;
  items: readonly T[];
  value: T;
  render: (k: T) => string;
  onPick: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {items.map((k) => (
          <Chip key={k} selected={value === k} onClick={() => onPick(k)}>
            {render(k)}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { archiveSkill, moveSkill, setSkillTags } from "@/app/actions/game";
import { deleteEntry, confirmEntry } from "@/app/actions/log";
import { Button, Chip } from "@/components/ui/primitives";
import { PART_KEYS, type PartKey } from "@/lib/game/attributes";
import { useSystem } from "./system-messages";

export function SkillActions({
  skillId,
  slot,
  status,
}: {
  skillId: string;
  slot: "main" | "secondary" | "none";
  status: string;
}) {
  const t = useTranslations("skills.actions");
  const { run, pending } = useSystem();
  if (status === "sleeping") return null;
  if (status === "archived") {
    return (
      <div className="flex gap-2">
        <Button variant="outline" disabled={pending} onClick={() => run(() => moveSkill({ skillId, slot: "secondary" }))}>
          {t("restore")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {slot !== "main" && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => moveSkill({ skillId, slot: "main" }))}>
          {t("toMain")}
        </Button>
      )}
      {slot !== "secondary" && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => moveSkill({ skillId, slot: "secondary" }))}>
          {t("toSecondary")}
        </Button>
      )}
      <Button variant="ghost" disabled={pending} onClick={() => run(() => archiveSkill(skillId))}>
        {t("archive")}
      </Button>
    </div>
  );
}

export function EntryActions({ entryId, draft }: { entryId: string; draft: boolean }) {
  const t = useTranslations("journal");
  const { run, pending } = useSystem();
  return (
    <div className="flex gap-2">
      {draft && (
        <Button disabled={pending} onClick={() => run(() => confirmEntry(entryId))}>
          {t("confirm")}
        </Button>
      )}
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (confirm(t("deleteConfirm"))) run(() => deleteEntry(entryId));
        }}
      >
        {t("delete")}
      </Button>
    </div>
  );
}

/** Выбор характеристик для навыка без тегов (например, взятого из кандидата). */
export function SkillTagPicker({ skillId }: { skillId: string }) {
  const t = useTranslations("skills.tags");
  const tg = useTranslations("game");
  const { run, pending } = useSystem();
  const [open, setOpen] = useState(false);
  const [primary, setPrimary] = useState<PartKey | null>(null);
  const [secondary, setSecondary] = useState<PartKey | null>(null);
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t("set")}
      </Button>
    );
  }
  const row = (value: PartKey | null, set: (v: PartKey | null) => void, label: string, allowNone: boolean) => (
    <fieldset className="space-y-1">
      <legend className="text-xs text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {allowNone && (
          <Chip selected={value === null} onClick={() => set(null)} className="text-xs">
            {t("none")}
          </Chip>
        )}
        {PART_KEYS.map((p) => (
          <Chip key={p} selected={value === p} onClick={() => set(p)} className="text-xs">
            {tg(`attributes.${p}`)}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-2 rounded-xl border border-panel-border p-3">
      <p className="text-xs text-muted">{t("hint")}</p>
      {row(primary, setPrimary, t("primary"), false)}
      {row(secondary, setSecondary, t("secondary"), true)}
      <Button
        disabled={!primary || pending}
        onClick={() => run(() => setSkillTags({ skillId, primary: primary!, secondary }))}
      >
        {t("save")}
      </Button>
    </div>
  );
}

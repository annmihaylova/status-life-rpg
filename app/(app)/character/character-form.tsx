"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveCharacter } from "@/app/actions/game";
import { AvatarEditor } from "@/components/game/avatar-editor";
import { ModelPicker } from "@/components/game/model-picker";
import { forgetPortrait } from "@/components/game/portrait";
import { useSystem } from "@/components/game/system-messages";
import { Button, Panel } from "@/components/ui/primitives";
import { baseModelUrl, type AvatarConfig } from "@/lib/game/avatar";

export function CharacterForm({
  initialAvatar,
  initialName,
  customUrl = null,
  uploader,
}: {
  initialAvatar: AvatarConfig;
  initialName: string;
  customUrl?: string | null;
  uploader?: React.ReactNode;
}) {
  const t = useTranslations("character");
  const router = useRouter();
  const { run, pending } = useSystem();
  const [avatar, setAvatar] = useState(initialAvatar);
  const [name, setName] = useState(initialName);
  return (
    <div className="space-y-4">
      <Panel title={t("looks")}>
        <ModelPicker
          value={avatar.model3d}
          customUrl={customUrl}
          uploader={uploader}
          onChange={(m) => setAvatar((a) => ({ ...a, model3d: m }))}
        />
      </Panel>
      {avatar.model3d === null && (
        <Panel>
          <AvatarEditor value={avatar} onChange={setAvatar} />
        </Panel>
      )}
      <Panel>
        <label className="block space-y-2">
          <span className="text-sm">{t("name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="w-full rounded-xl border border-panel-border bg-black/30 px-3 py-2 outline-none focus:border-accent"
          />
        </label>
      </Panel>
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const r = await saveCharacter({ avatar, gameName: name.trim() || undefined });
            // новый снимок портрета сделается на «Статусе»
            if (avatar.model3d?.source === "base") forgetPortrait(baseModelUrl(avatar.model3d.key));
            if (avatar.model3d?.source === "custom" && customUrl) forgetPortrait(customUrl);
            router.push("/");
            return r;
          })
        }
      >
        {t("save")}
      </Button>
    </div>
  );
}

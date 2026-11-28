"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { confirmCustomModel, deleteCustomModel } from "@/app/actions/avatar";
import { Button } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { inspectVrm, MAX_VRM_BYTES } from "@/lib/vrm/inspect";

/**
 * Загрузка своего персонажа из VRoid Studio (фаза 4b): проверка в браузере, загрузка прямо
 * в приватное хранилище (папка пользователя), затем проверка на сервере.
 */
export function ModelUploader({ userId, hasCustom }: { userId: string; hasCustom: boolean }) {
  const t = useTranslations("model3d");
  const tc = useTranslations("common");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const upload = (file: File) =>
    start(async () => {
      setStatus(null);
      if (file.size > MAX_VRM_BYTES) {
        setStatus({ ok: false, text: tc("errors.vrm_too_big") });
        return;
      }
      const check = inspectVrm(await file.arrayBuffer());
      if (!check.ok) {
        setStatus({ ok: false, text: tc(`errors.vrm_${check.error}`) });
        return;
      }
      setStatus({ ok: true, text: t("uploading") });
      const path = `${userId}/${Date.now().toString(36)}.vrm`;
      const { error } = await createClient()
        .storage.from("vrm-user")
        .upload(path, file, { contentType: "model/gltf-binary", upsert: false });
      if (error) {
        setStatus({ ok: false, text: tc("errors.vrm_upload_failed") });
        return;
      }
      const r = await confirmCustomModel(path);
      if (r.error) {
        setStatus({ ok: false, text: tc(`errors.${r.error}`) });
        return;
      }
      setStatus({ ok: true, text: t("uploaded", { title: r.title ?? file.name }) });
      router.refresh();
    });

  return (
    <div className="space-y-2 rounded-xl border border-panel-border p-3 text-sm">
      <p className="font-medium">{t("ownTitle")}</p>
      <details>
        <summary className="cursor-pointer text-xs text-muted">{t("howTo")}</summary>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted">
          {(t.raw("steps") as string[]).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </details>
      <input
        ref={input}
        type="file"
        accept=".vrm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => input.current?.click()}>
          {hasCustom ? t("replace") : t("upload")}
        </Button>
        {hasCustom && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (confirm(t("deleteConfirm"))) start(async () => (await deleteCustomModel(), router.refresh()));
            }}
          >
            {t("delete")}
          </Button>
        )}
      </div>
      {status && (
        <p role="status" className={status.ok ? "text-accent" : "text-hp"}>
          {status.text}
        </p>
      )}
    </div>
  );
}

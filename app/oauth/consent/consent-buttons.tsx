"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { decideOAuth } from "@/app/actions/oauth";
import { Button } from "@/components/ui/primitives";

export function ConsentButtons({ authorizationId }: { authorizationId: string }) {
  const t = useTranslations("oauth");
  const tc = useTranslations("common");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decide = (approve: boolean) =>
    start(async () => {
      setError(null);
      const r = await decideOAuth(authorizationId, approve);
      if (r.url) window.location.assign(r.url);
      else setError(tc(`errors.${r.error ?? "oauth_failed"}`));
    });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" disabled={pending} onClick={() => decide(false)}>
          {t("deny")}
        </Button>
        <Button className="flex-1" disabled={pending} onClick={() => decide(true)}>
          {pending ? t("working") : t("approve")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-hp">
          {error}
        </p>
      )}
    </div>
  );
}

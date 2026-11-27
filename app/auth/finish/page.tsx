"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";

/**
 * Возврат из письма входа (implicit flow): Supabase кладёт токены во фрагмент URL (#access_token=…).
 * Фрагмент не уходит на сервер, поэтому сессию ставим здесь, в браузере.
 * В отличие от PKCE это работает, даже если письмо открыто в другом браузере или на телефоне.
 */
export default function AuthFinishPage() {
  const t = useTranslations("login");
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    // убираем токены из адресной строки и истории
    window.history.replaceState(null, "", window.location.pathname);

    if (!accessToken || !refreshToken) {
      router.replace("/login?error=link");
      return;
    }
    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setFailed(true);
          router.replace("/login?error=link");
        } else {
          router.replace(next);
          router.refresh();
        }
      });
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <p className="font-mono text-accent">{failed ? t("linkFailed") : t("finishing")}</p>
    </main>
  );
}

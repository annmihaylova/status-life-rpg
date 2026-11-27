import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ConsentButtons } from "./consent-buttons";

/**
 * Страница согласия OAuth-сервера Supabase (Authentication → OAuth Server → Authorization path).
 * Сюда Supabase отправляет пользователя с `authorization_id`, когда ИИ-клиент (Claude) просит доступ.
 */
export default async function OAuthConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const t = await getTranslations("oauth");
  const { authorization_id: raw } = await searchParams;
  const authorizationId = typeof raw === "string" ? raw : null;

  if (!(await getUserId())) {
    const back = authorizationId ? `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}` : "/";
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const details = authorizationId
    ? await (await createClient()).auth.oauth.getAuthorizationDetails(authorizationId)
    : null;
  const data = details && !details.error ? details.data : null;
  // клиент уже получал согласие на эти права: Supabase сразу отдаёт адрес возврата
  if (data && !("authorization_id" in data)) redirect(data.redirect_url);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="system-panel w-full max-w-sm space-y-4 p-6">
        <h1 className="font-mono text-lg tracking-wide text-accent">{t("title")}</h1>
        {!data || !authorizationId ? (
          <p className="text-sm text-hp">{t("invalid")}</p>
        ) : (
          <>
            <p className="text-sm">
              {t.rich("question", {
                client: data.client.name || t("unknownClient"),
                b: (chunks) => <strong className="text-accent">{chunks}</strong>,
              })}
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted">
              <li>{t("canRead")}</li>
              <li>{t("canWrite")}</li>
              <li>{t("cannot")}</li>
            </ul>
            <p className="font-mono text-xs text-muted">
              {t("account", { email: data.user.email })}
              <br />
              {t("returnTo", { host: hostOf(data.redirect_uri) })}
            </p>
            <ConsentButtons authorizationId={authorizationId} />
            <p className="text-xs text-muted">{t("revokeHint")}</p>
          </>
        )}
      </section>
    </main>
  );
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

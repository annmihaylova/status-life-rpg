import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getTranslations("login");
  const tp = await getTranslations("privacy");
  const { error, next, deleted } = await searchParams;
  const initialError = typeof error === "string" ? t("linkFailed") : null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="system-panel w-full max-w-sm p-6">
        <h1 className="font-mono text-lg tracking-wide text-accent">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("subtitle")}</p>
        {deleted === "1" && (
          <p role="status" className="mt-3 rounded-xl border border-panel-border p-3 text-sm">
            {t("accountDeleted")}
          </p>
        )}
        <LoginForm initialError={initialError} next={safeNext(next)} />
        <Link href="/privacy" className="mt-4 block text-center text-xs text-muted underline">
          {tp("link")}
        </Link>
      </section>
    </main>
  );
}

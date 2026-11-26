import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getTranslations("login");
  const { error } = await searchParams;
  const initialError = typeof error === "string" ? t("linkFailed") : null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="system-panel w-full max-w-sm p-6">
        <h1 className="font-mono text-lg tracking-wide text-accent">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("subtitle")}</p>
        <LoginForm initialError={initialError} />
      </section>
    </main>
  );
}

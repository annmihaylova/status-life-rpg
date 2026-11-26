import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const t = await getTranslations("login");
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="system-panel w-full max-w-sm p-6">
        <h1 className="font-mono text-lg tracking-wide text-accent">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("subtitle")}</p>
        <LoginForm />
      </section>
    </main>
  );
}

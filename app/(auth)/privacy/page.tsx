import Link from "next/link";
import { getTranslations } from "next-intl/server";

type Section = { h: string; p: string };

/** Публичная страница политики конфиденциальности (нужна Google для экрана входа). */
export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  const sections = t.raw("sections") as Section[];

  return (
    <main className="flex flex-1 justify-center p-6">
      <article className="system-panel w-full max-w-2xl space-y-5 p-6">
        <header>
          <h1 className="font-mono text-lg tracking-wide text-accent">{t("title")}</h1>
          <p className="mt-1 text-xs text-muted">{t("updated")}</p>
        </header>
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="font-medium">{s.h}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.p}</p>
          </section>
        ))}
        <Link href="/" className="inline-block text-sm text-accent">
          {t("back")}
        </Link>
      </article>
    </main>
  );
}

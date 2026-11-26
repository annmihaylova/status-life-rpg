import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { characterLevelFromXp } from "@/lib/game/formulas";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  // Чтение через supabase-js с JWT пользователя: RLS отдаёт только его строку.
  const { data: character } = await supabase
    .from("characters")
    .select("total_xp_cache")
    .maybeSingle();
  const progress = characterLevelFromXp(character?.total_xp_cache ?? 0);
  const t = await getTranslations("home");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="system-panel w-full max-w-md space-y-3 p-6 font-mono">
        <p className="text-accent">{t("greeting")}</p>
        <p className="text-2xl">{t("level", { level: progress.level })}</p>
        <div
          className="h-2 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.xpForLevel}
          aria-valuenow={progress.xpIntoLevel}
        >
          <div
            className="h-full bg-accent"
            style={{ width: `${(100 * progress.xpIntoLevel) / progress.xpForLevel}%` }}
          />
        </div>
        <p className="font-sans text-sm text-muted">{t("soon")}</p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-muted underline underline-offset-4">
            {t("signOut")}
          </button>
        </form>
      </section>
    </main>
  );
}

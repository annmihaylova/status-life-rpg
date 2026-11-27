import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Panel } from "@/components/ui/primitives";
import { getRecentCheckins } from "@/lib/server/game/queries";
import { llmAvailable } from "@/lib/server/llm/checkin";
import { LLM_CONFIG } from "@/lib/server/llm/config";
import { requireUserId } from "@/lib/server/session";
import { CheckinForm } from "./checkin-form";

export default async function CheckinPage() {
  const userId = await requireUserId();
  const [t, locale] = await Promise.all([getTranslations("checkin"), getLocale()]);
  const recent = await getRecentCheckins(userId);
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <CheckinForm available={llmAvailable()} maxChars={LLM_CONFIG.maxTranscriptChars} />
      {recent.length > 0 && (
        <Panel title={t("recent")}>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/checkin/${r.id}`} className="flex justify-between text-sm hover:text-accent">
                  <span>{fmt.format(new Date(`${r.date}T00:00:00Z`))}</span>
                  <span className="font-mono text-xs text-muted">
                    {r.drafts > 0 ? t("draftsLeft", { n: r.drafts }) : t(`status.${r.status}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

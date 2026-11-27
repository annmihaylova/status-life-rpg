import { Bot, Hand, Mic, Timer } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EntryActions } from "@/components/game/skill-actions";
import { Panel, cn } from "@/components/ui/primitives";
import { getJournal, type JournalEntry } from "@/lib/server/game/queries";
import { requireUserId } from "@/lib/server/session";

const SOURCE_ICON = {
  mcp_claude: Bot,
  mcp_chatgpt: Bot,
  mcp_other: Bot,
  checkin: Mic,
  manual: Hand,
  timer: Timer,
} as const;

export default async function JournalPage() {
  const userId = await requireUserId();
  const [entries, t, locale] = await Promise.all([getJournal(userId), getTranslations("journal"), getLocale()]);

  const days = new Map<string, JournalEntry[]>();
  for (const e of entries) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {entries.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}
      {[...days.entries()].map(([date, list]) => {
        const total = list.filter((e) => e.status === "confirmed").reduce((s, e) => s + e.focusMinutes, 0);
        return (
          <Panel
            key={date}
            title={fmt.format(new Date(`${date}T00:00:00Z`))}
            action={<span className="font-mono text-xs text-muted">{t("dayTotal", { minutes: total })}</span>}
          >
            <ul className="space-y-3">
              {list.map((e) => {
                const Icon = SOURCE_ICON[e.source as keyof typeof SOURCE_ICON] ?? Hand;
                const draft = e.status === "draft";
                return (
                  <li
                    key={e.id}
                    className={cn("space-y-2 rounded-xl border p-3", draft ? "border-star/60 bg-star/5" : "border-panel-border/60")}
                  >
                    <div className="flex items-start gap-2">
                      <Icon aria-label={t(`source.${e.source}`)} size={16} className="mt-0.5 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{e.description}</p>
                        <p className="font-mono text-xs text-muted">
                          {t("line", { minutes: e.focusMinutes, intensity: e.intensity })}
                          {e.isRest && ` · ${t("rest")}`}
                          {draft && ` · ${t("draft")}`}
                        </p>
                        {e.skills.length > 0 && (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {e.skills.map((s) => (
                              <span key={s.name} className="rounded-full border border-panel-border px-2 py-0.5 text-xs">
                                {s.name}
                                {s.share < 1 && ` ${Math.round(s.share * 100)}%`}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                    </div>
                    {draft && e.checkinId ? (
                      <Link href={`/checkin/${e.checkinId}`} className="inline-block text-sm text-accent underline underline-offset-4">
                        {t("review")}
                      </Link>
                    ) : (
                      <EntryActions entryId={e.id} draft={draft} />
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </>
  );
}

import { and, desc, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Panel } from "@/components/ui/primitives";
import { withUser } from "@/lib/db";
import { apiTokens, notificationSettings, profiles, pushSubscriptions, userSettings } from "@/lib/db/schema";
import { requireUserId } from "@/lib/server/session";
import { ReminderSettings } from "./reminders";
import { AiSettings, LocaleSwitch, TokenManager } from "./settings-client";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [t, locale, h] = await Promise.all([getTranslations("settings"), getLocale(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "status-life-rpg.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const mcpUrl = `${proto}://${host}/api/mcp`;

  const data = await withUser(userId, async (tx) => {
    const tokens = await tx
      .select({ id: apiTokens.id, label: apiTokens.label, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
      .orderBy(desc(apiTokens.createdAt));
    const [s] = await tx.select({ auto: userSettings.autoConfirmAi }).from(userSettings).where(eq(userSettings.userId, userId));
    const [n] = await tx.select().from(notificationSettings).where(eq(notificationSettings.userId, userId));
    const [p] = await tx.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.id, userId));
    const devices = await tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    return {
      tokens,
      autoConfirm: s?.auto ?? false,
      reminder: { enabled: n?.enabled ?? true, time: n?.checkinLocalTime ?? "21:00", timeZone: p?.tz || "UTC" },
      devices: devices.length,
    };
  });
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      <Panel title={t("reminders")}>
        <ReminderSettings {...data.reminder} devices={data.devices} />
      </Panel>

      <Panel title={t("ai.title")} className="space-y-3 text-sm">
        <p className="text-muted">{t("ai.intro")}</p>
        <ol className="list-inside list-decimal space-y-2">
          <li>{t("ai.step1")}</li>
          <li>
            {t("ai.step2")} <code className="break-all rounded bg-black/40 px-1 font-mono text-xs">{mcpUrl}</code>
          </li>
          <li>{t("ai.step3")}</li>
          <li>{t("ai.step4")}</li>
          <li>{t("ai.step5")}</li>
        </ol>
        <details>
          <summary className="cursor-pointer text-muted">{t("ai.instructionsTitle")}</summary>
          <p className="mt-2 text-xs text-muted">{t("ai.instructionsHint")}</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-xs">{t("ai.instructions")}</pre>
        </details>
        <details>
          <summary className="cursor-pointer text-muted">{t("ai.chatgptTitle")}</summary>
          <p className="mt-2 text-xs">{t("ai.chatgpt")}</p>
        </details>
      </Panel>

      <Panel title={t("ai.connected")} className="space-y-4">
        <TokenManager
          mcpUrl={mcpUrl}
          tokens={data.tokens.map((x) => ({
            id: x.id,
            label: x.label,
            created: fmt.format(x.createdAt),
            lastUsed: x.lastUsedAt ? fmt.format(x.lastUsedAt) : null,
          }))}
        />
      </Panel>

      <Panel title={t("autoTitle")}>
        <AiSettings autoConfirm={data.autoConfirm} />
      </Panel>

      <Panel title={t("language")}>
        <LocaleSwitch locale={locale} />
      </Panel>
    </>
  );
}

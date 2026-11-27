/**
 * Web push (VAPID). Ключи сервер создаёт сам при первом обращении и хранит в служебной
 * таблице app_secrets (без прав у пользователей) — вручную ничего вписывать не нужно.
 * Публичный ключ отдаётся браузеру для подписки.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import * as webpush from "web-push";
import type { Db } from "@/lib/db/client";
import {
  appSecrets,
  checkins,
  notificationSettings,
  onboardingProfiles,
  profiles,
  pushSubscriptions,
} from "@/lib/db/schema";
import { reminderDue } from "@/lib/notifications/schedule";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cached: VapidKeys | null = null;

export async function getVapidKeys(db: Db): Promise<VapidKeys> {
  if (cached) return cached;
  const read = async () => {
    const rows = await db
      .select({ key: appSecrets.key, value: appSecrets.value })
      .from(appSecrets)
      .where(inArray(appSecrets.key, ["vapid_public", "vapid_private"]));
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const pub = m.get("vapid_public");
    const priv = m.get("vapid_private");
    return pub && priv ? { publicKey: pub, privateKey: priv } : null;
  };
  let keys = await read();
  if (!keys) {
    const fresh = webpush.generateVAPIDKeys();
    // пара пишется одной транзакцией; если параллельный запрос успел первым — берём его ключи
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(appSecrets)
        .values({ key: "vapid_public", value: fresh.publicKey })
        .onConflictDoNothing()
        .returning({ key: appSecrets.key });
      if (inserted.length > 0) {
        await tx.insert(appSecrets).values({ key: "vapid_private", value: fresh.privateKey });
      }
    });
    keys = await read();
  }
  if (!keys) throw new Error("vapid_keys_unavailable");
  cached = keys;
  return keys;
}

export interface PushPayload {
  title: string;
  body: string;
  /** куда открыть приложение по нажатию */
  url: string;
  tag?: string;
}

const subject = () => process.env.NEXT_PUBLIC_SITE_URL || "https://status-life-rpg.vercel.app";

/** Отправка на все устройства пользователя; мёртвые подписки (404/410) удаляются. */
export async function sendPushToUser(db: Db, userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const keys = await getVapidKeys(db);
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    const k = s.keys as { p256dh?: string; auth?: string };
    if (!k.p256dh || !k.auth) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 3 * 3600,
        urgency: "normal",
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      }
    }
  }
  return { sent, failed };
}

export function reminderPayload(locale: string): PushPayload {
  const dict = locale === "en" ? en : ru;
  return { title: "Status", body: dict.checkin.prompt, url: "/checkin", tag: "checkin" };
}

/**
 * Напоминания о вечернем отчёте: всем, у кого включены напоминания, есть подписка
 * и наступило их время (lib/notifications/schedule.ts).
 */
export async function runCheckinReminders(db: Db, now = new Date()) {
  const rows = await db
    .select({
      userId: notificationSettings.userId,
      time: notificationSettings.checkinLocalTime,
      lastSentOn: notificationSettings.lastSentOn,
      channels: notificationSettings.channels,
      tz: profiles.timezone,
      locale: profiles.locale,
      ageBand: onboardingProfiles.ageBand,
    })
    .from(notificationSettings)
    .innerJoin(profiles, eq(profiles.id, notificationSettings.userId))
    .leftJoin(onboardingProfiles, eq(onboardingProfiles.userId, notificationSettings.userId))
    .where(
      and(
        eq(notificationSettings.enabled, true),
        sql`exists (select 1 from ${pushSubscriptions} where ${pushSubscriptions.userId} = ${notificationSettings.userId})`,
      ),
    );

  const stats = { checked: rows.length, due: 0, skippedReported: 0, sent: 0, failed: 0 };
  for (const r of rows) {
    if ((r.channels as { push?: boolean } | null)?.push === false) continue;
    const { due, day } = reminderDue({ now, timeZone: r.tz || "UTC", time: r.time, ageBand: r.ageBand, lastSentOn: r.lastSentOn });
    if (!due) continue;
    stats.due += 1;
    // день отмечаем сразу: повторный запуск планировщика не пришлёт второе напоминание
    await db.update(notificationSettings).set({ lastSentOn: day }).where(eq(notificationSettings.userId, r.userId));
    const [reported] = await db
      .select({ id: checkins.id })
      .from(checkins)
      .where(and(eq(checkins.userId, r.userId), eq(checkins.date, day)))
      .limit(1);
    if (reported) {
      stats.skippedReported += 1;
      continue;
    }
    const res = await sendPushToUser(db, r.userId, reminderPayload(r.locale ?? "ru"));
    stats.sent += res.sent;
    stats.failed += res.failed;
  }
  return stats;
}

/** Одноразовый токен планировщика (pg_cron → public.trigger_cron): проверяем и сжигаем. */
export async function consumeCronToken(db: Db, token: string | null): Promise<boolean> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const rows = await db.execute(
    sql`delete from cron_tokens where token = ${token} and created_at > now() - interval '10 minutes' returning token`,
  );
  return rows.length > 0;
}

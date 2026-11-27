"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb, withUser } from "@/lib/db";
import { notificationSettings, profiles, pushSubscriptions } from "@/lib/db/schema";
import { isTimeZone, parseLocalTime } from "@/lib/notifications/schedule";
import { getVapidKeys, reminderPayload, sendPushToUser } from "@/lib/server/push";
import { requireUserId } from "@/lib/server/session";

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Публичный ключ VAPID для подписки в браузере (создаётся при первом обращении). */
export async function getPushPublicKey(): Promise<string> {
  await requireUserId();
  return (await getVapidKeys(adminDb())).publicKey;
}

/** Подписка этого устройства. Если адрес уже был у другого аккаунта на том же устройстве — переходит к текущему. */
export async function savePushSubscription(input: unknown): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const v = subscriptionSchema.safeParse(input);
  if (!v.success) return { error: "push_failed" };
  const db = adminDb();
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: v.data.endpoint, keys: v.data.keys })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, keys: v.data.keys } });
  revalidatePath("/settings");
  return {};
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const userId = await requireUserId();
  const e = z.string().max(1000).parse(endpoint);
  await withUser(userId, (tx) =>
    tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, e))),
  );
  revalidatePath("/settings");
}

const reminderSchema = z.object({
  enabled: z.boolean(),
  time: z.string().refine((t) => parseLocalTime(t) !== null),
  timeZone: z.string().max(64).refine(isTimeZone),
});

export async function saveReminder(input: z.input<typeof reminderSchema>): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const v = reminderSchema.safeParse(input);
  if (!v.success) return { error: "bad_reminder" };
  await withUser(userId, async (tx) => {
    await tx
      .insert(notificationSettings)
      .values({ userId, enabled: v.data.enabled, checkinLocalTime: v.data.time })
      .onConflictDoUpdate({
        target: notificationSettings.userId,
        set: { enabled: v.data.enabled, checkinLocalTime: v.data.time },
      });
    await tx.update(profiles).set({ timezone: v.data.timeZone }).where(eq(profiles.id, userId));
  });
  revalidatePath("/settings");
  return {};
}

/** Пробное уведомление на все устройства пользователя. */
export async function sendTestPush(locale: string): Promise<{ sent: number; error?: string }> {
  const userId = await requireUserId();
  const res = await sendPushToUser(adminDb(), userId, { ...reminderPayload(locale), tag: "test" });
  return res.sent > 0 ? { sent: res.sent } : { sent: 0, error: "push_failed" };
}

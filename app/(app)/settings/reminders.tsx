"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  getPushPublicKey,
  removePushSubscription,
  savePushSubscription,
  saveReminder,
  sendTestPush,
} from "@/app/actions/notifications";
import { Button, Chip } from "@/components/ui/primitives";

type Support = "checking" | "ok" | "unsupported" | "ios-install";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/**
 * Напоминание о вечернем отчёте (SPEC 4.2): время, часовой пояс и push на этом устройстве.
 * На iPhone push работает только у приложения, добавленного на экран «Домой» (iOS 16.4+).
 */
export function ReminderSettings({
  enabled,
  time,
  timeZone,
  devices,
}: {
  enabled: boolean;
  time: string;
  timeZone: string;
  devices: number;
}) {
  const t = useTranslations("reminders");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [support, setSupport] = useState<Support>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [on, setOn] = useState(enabled);
  const [value, setValue] = useState(time);
  const [tz, setTz] = useState(timeZone);
  const [deviceTz, setDeviceTz] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // всё, что известно только в браузере, — после монтирования
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    let cancelled = false;
    (async () => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let s: Support = supported ? "ok" : ios && !standalone ? "ios-install" : "unsupported";
      let ep: string | null = null;
      if (s === "ok") {
        try {
          const reg = await registration();
          ep = (await reg.pushManager.getSubscription())?.endpoint ?? null;
        } catch {
          s = "unsupported";
        }
      }
      if (cancelled) return;
      setDeviceTz(zone);
      setSupport(s);
      setEndpoint(ep);
      setPermission(supported ? Notification.permission : null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = (next: { enabled?: boolean; time?: string; timeZone?: string }) =>
    start(async () => {
      setNote(null);
      const r = await saveReminder({ enabled: next.enabled ?? on, time: next.time ?? value, timeZone: next.timeZone ?? tz });
      if (r.error) setNote({ ok: false, text: tc(`errors.${r.error}`) });
      else {
        setNote({ ok: true, text: t("saved") });
        router.refresh();
      }
    });

  const subscribe = () =>
    start(async () => {
      setNote(null);
      try {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") {
          setNote({ ok: false, text: t("denied") });
          return;
        }
        const reg = await registration();
        await navigator.serviceWorker.ready;
        const key = await getPushPublicKey();
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
        const r = await savePushSubscription(JSON.parse(JSON.stringify(sub)));
        if (r.error) throw new Error(r.error);
        setEndpoint(sub.endpoint);
        if (!on) {
          setOn(true);
          await saveReminder({ enabled: true, time: value, timeZone: tz });
        }
        setNote({ ok: true, text: t("subscribed") });
        router.refresh();
      } catch {
        setNote({ ok: false, text: tc("errors.push_failed") });
      }
    });

  const unsubscribe = () =>
    start(async () => {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      router.refresh();
    });

  const test = () =>
    start(async () => {
      const r = await sendTestPush(locale);
      setNote(r.error ? { ok: false, text: tc(`errors.${r.error}`) } : { ok: true, text: t("testSent", { count: r.sent }) });
    });

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">{t("intro")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Chip selected={on} disabled={pending} onClick={() => (setOn(true), save({ enabled: true }))}>
          {t("on")}
        </Chip>
        <Chip selected={!on} disabled={pending} onClick={() => (setOn(false), save({ enabled: false }))}>
          {t("off")}
        </Chip>
      </div>

      <label className="flex items-center gap-3">
        <span>{t("time")}</span>
        <input
          type="time"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== time && save({ time: value })}
          className="rounded-xl border border-panel-border bg-black/30 px-3 py-1.5 font-mono outline-none focus:border-accent"
        />
      </label>

      <div className="space-y-1">
        <p>
          {t("timeZone")}: <span className="font-mono">{tz}</span>
        </p>
        {deviceTz && deviceTz !== tz && (
          <Button variant="outline" disabled={pending} onClick={() => (setTz(deviceTz), save({ timeZone: deviceTz }))}>
            {t("useDeviceTz", { tz: deviceTz })}
          </Button>
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-panel-border p-3">
        <p className="font-medium">{t("thisDevice")}</p>
        {support === "checking" && <p className="text-muted">…</p>}
        {support === "unsupported" && <p className="text-muted">{t("unsupported")}</p>}
        {support === "ios-install" && (
          <div className="space-y-1 text-muted">
            <p>{t("iosTitle")}</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>{t("ios1")}</li>
              <li>{t("ios2")}</li>
              <li>{t("ios3")}</li>
            </ol>
          </div>
        )}
        {support === "ok" &&
          (endpoint ? (
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-accent">{t("deviceOn")}</span>
              <Button variant="outline" disabled={pending} onClick={test}>
                {t("test")}
              </Button>
              <Button variant="outline" disabled={pending} onClick={unsubscribe}>
                {t("deviceOff")}
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Button disabled={pending} onClick={subscribe}>
                {t("enableDevice")}
              </Button>
              {permission === "denied" && <p className="text-hp">{t("denied")}</p>}
            </div>
          ))}
        <p className="text-xs text-muted">{t("devices", { count: devices })}</p>
      </div>

      {note && (
        <p role="status" className={note.ok ? "text-accent" : "text-hp"}>
          {note.text}
        </p>
      )}
    </div>
  );
}

/**
 * Приём данных с часов и телефона (фаза 3d): POST /api/ingest с личным токеном `sts_…`.
 * Сон → самочувствие дня (HP), тренировки/ходьба/занятия → черновики записей через ту же
 * логику, что у MCP (кандидаты, защита от дублей, автоподтверждение по настройке).
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { withUserTx } from "@/lib/db/client";
import { hpDays, profiles, skills } from "@/lib/db/schema";
import { localDate } from "@/lib/game/dates";
import { parseIngestBody, planIngest } from "@/lib/devices/ingest";
import { recomputeUser } from "@/lib/server/game/recompute";
import { takeMcpSlot } from "@/lib/server/mcp/rate-limit";
import { logActivities } from "@/lib/server/mcp/tools";
import { tokenFromHeaders, verifyToken } from "@/lib/server/mcp/tokens";

const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function handleIngest(db: Db, req: Request): Promise<Response> {
  const token = tokenFromHeaders(req.headers);
  const owner = token ? await verifyToken(db, token) : null;
  if (!owner) return json({ error: "unauthorized", message: "Send Authorization: Bearer sts_… (Status → Settings → Devices)" }, 401);
  if (!(await takeMcpSlot(db, owner.userId))) return json({ error: "rate_limited" }, 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const { items, errors } = parseIngestBody(body);
  if (items.length === 0) return json({ error: "no_valid_items", invalid: errors }, 400);

  const ctx = await withUserTx(db, owner.userId, async (tx) => {
    const [p] = await tx.select({ tz: profiles.timezone, locale: profiles.locale }).from(profiles).where(eq(profiles.id, owner.userId));
    const own = await tx.select({ id: skills.id, name: skills.name, status: skills.status }).from(skills).where(eq(skills.userId, owner.userId));
    return {
      timeZone: p?.tz || "UTC",
      today: localDate(new Date(), p?.tz || "UTC"),
      locale: (p?.locale === "en" ? "en" : "ru") as "ru" | "en",
      skills: own.filter((s) => s.status !== "archived").map((s) => ({ id: s.id, name: s.name })),
    };
  });
  const plan = planIngest(items, ctx);

  // сон: в самочувствие дня, как если бы человек ввёл его сам
  if (plan.sleep.length > 0) {
    await withUserTx(db, owner.userId, async (tx) => {
      for (const s of plan.sleep) {
        await tx
          .insert(hpDays)
          .values({ userId: owner.userId, date: s.date, hpMax: 0, hpMorning: 0, hpCurrent: 0, sleepHours: s.hours })
          .onConflictDoUpdate({ target: [hpDays.userId, hpDays.date], set: { sleepHours: s.hours } });
      }
    });
  }

  const logged =
    plan.entries.length > 0
      ? await logActivities({ db, userId: owner.userId, tokenId: owner.tokenId, source: "device" }, plan.entries)
      : null;
  // если записи подтвердились автоматически, пересчёт уже был; иначе пересчитываем ради сна
  if (plan.sleep.length > 0 && logged?.status !== "confirmed") await recomputeUser(db, owner.userId);

  const en = ctx.locale === "en";
  const created = (logged?.results ?? []).filter((r) => r.status === "created").length;
  const dup = (logged?.results ?? []).filter((r) => r.status === "duplicate").length;
  const parts = [
    ...plan.sleep.map((s) => (en ? `sleep ${s.hours} h (${s.date})` : `сон ${s.hours} ч (${s.date})`)),
    ...plan.entries.map((e) => `${e.description} ${e.focus_minutes} ${en ? "min" : "мин"} (${e.date})`),
  ];
  const message =
    (en ? "Status: " : "Status: ") +
    (parts.length ? parts.join(", ") : en ? "nothing to save" : "нечего записать") +
    (created ? (en ? `. New drafts: ${created}` : `. Новых черновиков: ${created}`) : "") +
    (dup ? (en ? `. Already saved: ${dup}` : `. Уже было: ${dup}`) : "") +
    (plan.skipped + errors ? (en ? `. Skipped: ${plan.skipped + errors}` : `. Пропущено: ${plan.skipped + errors}`) : "");

  return json({
    ok: true,
    message,
    sleep: plan.sleep,
    entries: logged?.results ?? [],
    status: logged?.status ?? null,
    skipped: plan.skipped,
    invalid: errors,
  });
}

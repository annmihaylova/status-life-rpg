/**
 * Логика инструментов MCP (SPEC 7.3). Всё — от имени владельца токена:
 * чтение и запись через withUserTx (RLS), пересчёт через recomputeUser.
 * Ответы — данные, а не инструкции: описания обрезаются и отдаются как JSON-строки (SPEC 11).
 */
import { and, asc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";
import { withUserTx, type Db } from "@/lib/db/client";
import {
  activityEntries,
  entrySkillAllocations,
  profiles,
  skillCandidates,
  skills,
  userSettings,
  weeklyChronicles,
} from "@/lib/db/schema";
import { clusterKeyOf } from "@/lib/checkin/normalize";
import { GENERAL_KEYS, PART_KEYS, type AttributeKey } from "@/lib/game/attributes";
import { GAME_CONFIG } from "@/lib/game/config";
import { addDays, isIsoDate, localDate } from "@/lib/game/dates";
import { replay } from "@/lib/game/engine/replay";
import type { EngineResult } from "@/lib/game/engine/types";
import { characterLevelFromXp, normalizeShares, skillRank } from "@/lib/game/formulas";
import { eventToMessage, xpMessage } from "@/lib/game/messages";
import { letterWeekStart, periodSummary } from "@/lib/game/chronicle";
import { className, titleName, weekStartOf } from "@/lib/game/progression";
import { loadEngineInput } from "@/lib/server/game/load";
import { recomputeUser } from "@/lib/server/game/recompute";
import { confirmDrafts } from "@/lib/server/game/drafts";

export type McpSource = "mcp_claude" | "mcp_chatgpt" | "mcp_other";

export interface McpContext {
  db: Db;
  userId: string;
  tokenId: string;
  source: McpSource;
}

const E = GAME_CONFIG.entry;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Пользовательский текст в ответе: без управляющих символов и не длиннее limit. */
const safe = (s: string | null | undefined, limit = 200) =>
  (s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit);

async function profileOf(ctx: McpContext) {
  const [p] = await withUserTx(ctx.db, ctx.userId, (tx) =>
    tx.select({ tz: profiles.timezone, locale: profiles.locale }).from(profiles).where(eq(profiles.id, ctx.userId)),
  );
  return { tz: p?.tz || "UTC", locale: (p?.locale === "en" ? "en" : "ru") as "ru" | "en" };
}

// ───────── get_status ─────────

export async function getStatus(ctx: McpContext) {
  const { input } = await loadEngineInput(ctx.db, ctx.userId, new Date());
  const { locale } = await profileOf(ctx);
  const r = replay(input);
  const lp = characterLevelFromXp(r.character.totalXp);
  const names = await withUserTx(ctx.db, ctx.userId, (tx) =>
    tx.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.userId, ctx.userId)),
  );
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const todayIds = new Set(input.entries.filter((e) => e.date === input.today).map((e) => e.id));
  const hp = r.hpDays[input.today];
  const unfolded = new Set(GENERAL_KEYS.filter((g) => r.attributes[g]?.state === "unfolded"));
  const attrs = Object.values(r.attributes)
    .filter((a) => a && a.state !== "unfolded")
    .filter((a) => a!.state === "part" || !unfolded.has(a!.key as never))
    .map((a) => ({ key: a!.key, value: a!.value, stars: a!.stars }));
  return {
    today: input.today,
    level: lp.level,
    xp_to_next_level: Math.ceil(lp.xpToNext),
    total_xp: Math.round(r.character.totalXp),
    xp_today: Math.round(
      r.ledger.filter((l) => l.targetType === "character" && todayIds.has(l.entryId)).reduce((s, l) => s + l.amount, 0),
    ),
    hp: hp ? { current: hp.current, max: hp.max, effects: hp.effects } : null,
    attributes: attrs,
    top_skills: Object.values(r.skills)
      .filter((s) => s.status === "active")
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 8)
      .map((s) => ({ name: safe(nameOf.get(s.id), 60), level: s.level, rank: skillRank(s.level) })),
    class: r.characterClass ? className(r.characterClass.key, locale) : null,
    titles: r.titles.map((t) => titleName(t.key, locale)),
  };
}

// ───────── get_week_summary / save_week_letter (письмо Системы, PLAN 2г) ─────────

export const weekSchema = z.object({
  week_start: z.string().optional().describe("YYYY-MM-DD, понедельник недели; по умолчанию — неделя для письма"),
});

/** Цифры недели для письма: часы по навыкам и областям, рост, титулы, сравнение с прошлой неделей. */
export async function getWeekSummary(ctx: McpContext, weekStart?: string) {
  const { input } = await loadEngineInput(ctx.db, ctx.userId, new Date());
  const r = replay(input);
  const { locale } = await profileOf(ctx);
  const dict = locale === "en" ? en : ru;
  const ws = weekStart && isIsoDate(weekStart) ? weekStartOf(weekStart) : letterWeekStart(input.today);
  const week = periodSummary(input, r, ws, addDays(ws, 6));
  const prev = periodSummary(input, r, addDays(ws, -7), addDays(ws, -1));
  const names = await withUserTx(ctx.db, ctx.userId, (tx) =>
    tx.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.userId, ctx.userId)),
  );
  const nameOf = new Map(names.map((n) => [n.id, safe(n.name, 60)]));
  const domain = (d: string) => dict.game.domains[d as keyof typeof dict.game.domains] ?? d;
  const hours = (m: number) => Math.round((m / 60) * 10) / 10;
  return {
    week_start: ws,
    week_end: addDays(ws, 6),
    language: locale,
    focus_hours: hours(week.minutes),
    days_with_entries: week.activeDays,
    entries: week.entries,
    by_skill: week.skills.slice(0, 10).map((x) => ({ skill: nameOf.get(x.skillId) ?? "?", hours: hours(x.minutes) })),
    by_domain: week.domains.map((x) => ({ domain: domain(x.domain), hours: hours(x.minutes) })),
    level: { from: week.levelFrom, to: week.levelTo },
    new_skills: week.newSkills.map((id) => nameOf.get(id) ?? "?"),
    rank_ups: week.rankUps.map((x) => ({
      skill: nameOf.get(x.skillId) ?? "?",
      rank: dict.game.ranks[x.rank as keyof typeof dict.game.ranks] ?? x.rank,
    })),
    skill_level_ups: week.skillLevelUps,
    attribute_points: week.attributePoints.map((x) => ({ attribute: dict.game.attributes[x.attribute], to: x.to })),
    titles: week.titles.map((k) => titleName(k, locale)),
    previous_week_focus_hours: hours(prev.minutes),
    note:
      "Письмо: 80–180 слов на языке language, тёпло и конкретно, с цифрами из этих данных. Без лести, без упрёков за пропуски и без советов работать больше. Отдых и тихие недели — нормально.",
  };
}

export const letterSchema = z.object({
  week_start: z.string().describe("YYYY-MM-DD, понедельник недели из get_week_summary"),
  text: z.string().min(20).max(3000).describe("Текст письма"),
});

/** Сохраняет письмо недели; показывается в Хронике вместо шаблона. */
export async function saveWeekLetter(ctx: McpContext, args: z.infer<typeof letterSchema>) {
  if (!isIsoDate(args.week_start)) return { ok: false, error: "bad_week_start" };
  const ws = weekStartOf(args.week_start);
  const text = args.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  const { input } = await loadEngineInput(ctx.db, ctx.userId, new Date());
  if (ws > input.today) return { ok: false, error: "future_week" };
  const stats = periodSummary(input, replay(input), ws, addDays(ws, 6));
  await withUserTx(ctx.db, ctx.userId, (tx) =>
    tx
      .insert(weeklyChronicles)
      .values({ userId: ctx.userId, weekStart: ws, stats, letterText: text })
      .onConflictDoUpdate({
        target: [weeklyChronicles.userId, weeklyChronicles.weekStart],
        set: { stats, letterText: text },
      }),
  );
  return { ok: true, week_start: ws, shown_in: "Status → Хроника" };
}

// ───────── list_skills ─────────

export async function listSkills(ctx: McpContext, query?: string) {
  return withUserTx(ctx.db, ctx.userId, async (tx) => {
    const q = query?.trim();
    const rows = await tx
      .select()
      .from(skills)
      .where(and(eq(skills.userId, ctx.userId), ne(skills.status, "archived"), q ? ilike(skills.name, `%${q}%`) : undefined))
      .orderBy(asc(skills.name));
    const cands = await tx
      .select()
      .from(skillCandidates)
      .where(
        and(
          eq(skillCandidates.userId, ctx.userId),
          inArray(skillCandidates.offerStatus, ["accruing", "offered", "snoozed"]),
          q ? ilike(skillCandidates.suggestedName, `%${q}%`) : undefined,
        ),
      );
    return {
      skills: rows.map((s) => ({
        skill_id: s.id,
        name: safe(s.name, 60),
        scope: safe(s.scope),
        level: s.levelCache,
        status: s.status,
        slot: s.slot,
      })),
      candidates: cands.map((c) => ({
        activity_cluster: c.clusterKey,
        name: safe(c.suggestedName ?? c.clusterKey, 60),
        minutes_so_far: c.minutesTotal,
      })),
      note: "Используй skill_id существующего навыка. Если ничего не подходит — activity_cluster: короткое обобщённое название умения.",
    };
  });
}

// ───────── get_day ─────────

export async function getDay(ctx: McpContext, date?: string) {
  const { tz } = await profileOf(ctx);
  const day = date && isIsoDate(date) ? date : localDate(new Date(), tz);
  return withUserTx(ctx.db, ctx.userId, async (tx) => {
    const rows = await tx
      .select()
      .from(activityEntries)
      .where(and(eq(activityEntries.userId, ctx.userId), eq(activityEntries.date, day), ne(activityEntries.status, "rejected")))
      .orderBy(asc(activityEntries.createdAt));
    const allocs = rows.length
      ? await tx
          .select({ entryId: entrySkillAllocations.entryId, name: skills.name, cluster: entrySkillAllocations.activityCluster, share: entrySkillAllocations.share })
          .from(entrySkillAllocations)
          .leftJoin(skills, eq(skills.id, entrySkillAllocations.skillId))
          .where(inArray(entrySkillAllocations.entryId, rows.map((r) => r.id)))
      : [];
    return {
      date: day,
      entries: rows.map((r) => ({
        id: r.id,
        description: safe(r.description),
        focus_minutes: r.focusMinutes,
        intensity: r.intensity,
        status: r.status,
        source: r.source,
        client_ref: r.clientRef,
        created_by_this_agent: r.createdByToken === ctx.tokenId,
        skills: allocs
          .filter((a) => a.entryId === r.id)
          .map((a) => ({ name: safe(a.name ?? a.cluster, 60), share: Math.round(a.share * 100) / 100 })),
      })),
    };
  });
}

// ───────── log_activities ─────────

export const logItemSchema = z.object({
  date: z.string().describe("YYYY-MM-DD, локальная дата пользователя"),
  description: z.string().min(1).max(300),
  focus_minutes: z.number().int().min(1).max(960).describe("фокусное время, а не длительность чата"),
  intensity: z.number().min(0.5).max(1.6).describe("0.5 фоном, 1.0 обычно, 1.3 тяжело, 1.6 на пределе"),
  novelty: z.number().min(0.9).max(1.25).describe("0.9 рутина, 1.0 обычно, 1.2 много нового"),
  skills: z
    .array(
      z.object({
        skill_id: z.string().nullable(),
        activity_cluster: z.string().max(80).nullable(),
        share: z.number().min(0).max(1),
      }),
    )
    .max(5),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.string().max(500).optional(),
  client_ref: z.string().min(1).max(120).describe("ключ идемпотентности: повтор с тем же client_ref и date не создаёт дубль"),
});
export type LogItem = z.infer<typeof logItemSchema>;

export async function logActivities(ctx: McpContext, items: LogItem[]) {
  const results: { client_ref: string; id: string | null; status: "created" | "duplicate" | "error"; error?: string }[] = [];
  let autoConfirm = false;
  const created: string[] = [];

  const before = replay((await loadEngineInput(ctx.db, ctx.userId, new Date())).input);

  await withUserTx(ctx.db, ctx.userId, async (tx) => {
    const [settings] = await tx.select({ auto: userSettings.autoConfirmAi }).from(userSettings).where(eq(userSettings.userId, ctx.userId));
    autoConfirm = settings?.auto ?? false;
    const own = await tx.select({ id: skills.id }).from(skills).where(eq(skills.userId, ctx.userId));
    const ownIds = new Set(own.map((s) => s.id));

    for (const item of items) {
      if (!isIsoDate(item.date)) {
        results.push({ client_ref: item.client_ref, id: null, status: "error", error: "bad_date" });
        continue;
      }
      const [dup] = await tx
        .select({ id: activityEntries.id })
        .from(activityEntries)
        .where(
          and(
            eq(activityEntries.userId, ctx.userId),
            eq(activityEntries.date, item.date),
            eq(activityEntries.clientRef, item.client_ref),
          ),
        );
      if (dup) {
        results.push({ client_ref: item.client_ref, id: dup.id, status: "duplicate" });
        continue;
      }

      const allocs = normalizeShares(
        item.skills
          .map((s) => {
            const skillId = s.skill_id && ownIds.has(s.skill_id) ? s.skill_id : null;
            const cluster = !skillId && s.activity_cluster ? clusterKeyOf(s.activity_cluster) || null : null;
            return { skillId, cluster, label: s.activity_cluster, share: s.share };
          })
          .filter((a) => a.skillId || a.cluster),
      ).slice(0, E.maxSkillsPerEntry);

      for (const a of allocs) {
        if (a.cluster) {
          await tx
            .insert(skillCandidates)
            .values({ userId: ctx.userId, clusterKey: a.cluster, suggestedName: safe(a.label, 60) })
            .onConflictDoNothing();
        }
      }

      const [row] = await tx
        .insert(activityEntries)
        .values({
          userId: ctx.userId,
          date: item.date,
          focusMinutes: Math.round(clamp(item.focus_minutes, E.focusMinutes.min, E.focusMinutes.max)),
          intensity: clamp(item.intensity, E.intensity.min, E.intensity.max),
          novelty: clamp(item.novelty, E.novelty.min, E.novelty.max),
          description: safe(item.description, 300),
          source: ctx.source,
          status: "draft",
          confidence: item.confidence ?? null,
          evidence: item.evidence ? safe(item.evidence, 500) : null,
          clientRef: item.client_ref,
          createdByToken: ctx.tokenId,
        })
        .returning({ id: activityEntries.id });
      const total = allocs.reduce((s, a) => s + a.share, 0) || 1;
      if (allocs.length) {
        await tx.insert(entrySkillAllocations).values(
          allocs.map((a) => ({
            entryId: row.id,
            userId: ctx.userId,
            skillId: a.skillId,
            activityCluster: a.cluster,
            share: a.share / total,
          })),
        );
      }
      created.push(row.id);
      results.push({ client_ref: item.client_ref, id: row.id, status: "created" });
    }
    if (autoConfirm && created.length) await confirmDrafts(tx, ctx.userId, created);
  });

  let systemMessages: string[] = [];
  if (autoConfirm && created.length) {
    const { result: after } = await recomputeUser(ctx.db, ctx.userId);
    systemMessages = await renderMessages(ctx, before, after);
  }
  return {
    results,
    status: autoConfirm ? "confirmed" : "draft",
    note: autoConfirm
      ? "Записи подтверждены автоматически (так настроено у пользователя)."
      : "Записи созданы черновиками: пользователь подтвердит их в приложении Status (Журнал).",
    system_messages: systemMessages,
  };
}

async function renderMessages(ctx: McpContext, before: EngineResult, after: EngineResult): Promise<string[]> {
  const { locale } = await profileOf(ctx);
  const dict = locale === "en" ? en : ru;
  const fmt = (key: string, values: Record<string, string | number>) =>
    (dict.system[key as keyof typeof dict.system] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
  const nameRows = await withUserTx(ctx.db, ctx.userId, (tx) =>
    tx.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.userId, ctx.userId)),
  );
  const names = new Map(nameRows.map((n) => [n.id, n.name]));
  const seen = new Set(before.events.map((e) => e.id));
  const out: string[] = [];
  const gained = after.character.totalXp - before.character.totalXp;
  if (gained >= 0.5) {
    const m = xpMessage(gained);
    out.push(fmt(m.key, m.values));
  }
  for (const e of after.events.filter((x) => !seen.has(x.id))) {
    const m = eventToMessage(e, {
      skill: (id) => safe(names.get(id), 60),
      cluster: (c) => c,
      attribute: (k: AttributeKey) => dict.game.attributes[k],
      rank: (r) => dict.game.ranks[r as keyof typeof dict.game.ranks] ?? r,
      title: (k) => titleName(k, locale),
      className: (k) => className(k, locale),
    });
    out.push(fmt(m.key, m.values));
  }
  return out;
}

// ───────── update_activity / delete_activity ─────────

export const updateSchema = z.object({
  id: z.string(),
  description: z.string().min(1).max(300).optional(),
  focus_minutes: z.number().int().min(1).max(960).optional(),
  intensity: z.number().min(0.5).max(1.6).optional(),
  novelty: z.number().min(0.9).max(1.25).optional(),
});

async function ownDraft(ctx: McpContext, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await withUserTx(ctx.db, ctx.userId, (tx) =>
    tx
      .select({ id: activityEntries.id, status: activityEntries.status, by: activityEntries.createdByToken })
      .from(activityEntries)
      .where(and(eq(activityEntries.id, id), eq(activityEntries.userId, ctx.userId))),
  );
  return row ?? null;
}

export async function updateActivity(ctx: McpContext, v: z.infer<typeof updateSchema>) {
  const row = await ownDraft(ctx, v.id);
  if (!row) return { ok: false, error: "not_found" };
  if (row.by !== ctx.tokenId) return { ok: false, error: "not_created_by_this_agent" };
  if (row.status !== "draft") return { ok: false, error: "already_confirmed" };
  await withUserTx(ctx.db, ctx.userId, (tx) =>
    tx
      .update(activityEntries)
      .set({
        ...(v.description ? { description: safe(v.description, 300) } : {}),
        ...(v.focus_minutes ? { focusMinutes: v.focus_minutes } : {}),
        ...(v.intensity ? { intensity: v.intensity } : {}),
        ...(v.novelty ? { novelty: clamp(v.novelty, E.novelty.min, E.novelty.max) } : {}),
      })
      .where(eq(activityEntries.id, v.id)),
  );
  return { ok: true };
}

export async function deleteActivity(ctx: McpContext, id: string) {
  const row = await ownDraft(ctx, id);
  if (!row) return { ok: false, error: "not_found" };
  if (row.by !== ctx.tokenId) return { ok: false, error: "not_created_by_this_agent" };
  if (row.status !== "draft") return { ok: false, error: "already_confirmed" };
  await withUserTx(ctx.db, ctx.userId, (tx) => tx.delete(activityEntries).where(eq(activityEntries.id, id)));
  return { ok: true };
}

// ───────── request_skill ─────────

export const requestSkillSchema = z.object({
  name: z.string().min(2).max(60).describe("обобщённое название навыка, как в резюме: «Шахматы», «Программирование»"),
  scope: z.string().max(300).optional(),
  primary_attribute: z.enum(PART_KEYS).optional(),
  secondary_attribute: z.enum(PART_KEYS).optional(),
});

function similar(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

export async function requestSkill(ctx: McpContext, v: z.infer<typeof requestSkillSchema>) {
  return withUserTx(ctx.db, ctx.userId, async (tx) => {
    const own = await tx.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.userId, ctx.userId));
    const cands = await tx
      .select({ cluster: skillCandidates.clusterKey, name: skillCandidates.suggestedName })
      .from(skillCandidates)
      .where(eq(skillCandidates.userId, ctx.userId));
    const possible = [
      ...own.filter((s) => similar(s.name, v.name)).map((s) => ({ skill_id: s.id, name: safe(s.name, 60) })),
      ...cands
        .filter((c) => similar(c.name ?? c.cluster, v.name))
        .map((c) => ({ activity_cluster: c.cluster, name: safe(c.name ?? c.cluster, 60) })),
    ];
    if (possible.length) {
      return {
        created: false,
        possible_duplicates: possible,
        note: "Похожий навык уже есть: используй его в log_activities.",
      };
    }
    const cluster = clusterKeyOf(v.name);
    const tags = v.primary_attribute ? { primary: v.primary_attribute, secondary: v.secondary_attribute ?? null } : null;
    await tx
      .insert(skillCandidates)
      .values({
        userId: ctx.userId,
        clusterKey: cluster,
        suggestedName: safe(v.name, 60),
        scope: safe(v.scope, 300),
        attributeTags: tags,
        requested: true,
      })
      .onConflictDoUpdate({
        target: [skillCandidates.userId, skillCandidates.clusterKey],
        set: { requested: true, attributeTags: sql`coalesce(${skillCandidates.attributeTags}, ${JSON.stringify(tags)}::jsonb)` },
      });
    return {
      created: true,
      activity_cluster: cluster,
      note: "Кандидат создан. Система предложит навык пользователю при первой активности; взять его решает пользователь в приложении. Логируй активность с этим activity_cluster.",
    };
  });
}

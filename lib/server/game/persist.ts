/**
 * Запись результата движка в кэш-таблицы и леджер.
 * Всё пересчитывается целиком: леджер пользователя заменяется, агрегаты перезаписываются.
 */
import { and, eq, notInArray, sql } from "drizzle-orm";
import { FORMULA_VERSION } from "@/lib/game/config";
import type { EngineResult } from "@/lib/game/engine/types";
import { titleDef } from "@/lib/game/progression";
import type { Tx } from "@/lib/db/client";
import {
  attributeXpTags,
  characters,
  hpDays,
  skillCandidates,
  skills,
  titles,
  userAttributes,
  userTitles,
  xpEvents,
} from "@/lib/db/schema";

const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

export async function persistEngineResult(tx: Tx, userId: string, r: EngineResult): Promise<void> {
  // леджер
  await tx.delete(xpEvents).where(eq(xpEvents.userId, userId));
  const rows = r.ledger.map((l) => ({
    userId,
    entryId: l.entryId,
    targetType: l.targetType,
    targetId: l.targetId,
    amount: l.amount,
    multipliers: l.multipliers,
    formulaVersion: FORMULA_VERSION,
  }));
  for (let i = 0; i < rows.length; i += 1000) {
    await tx.insert(xpEvents).values(rows.slice(i, i + 1000));
  }

  // персонаж
  await tx
    .update(characters)
    .set({
      levelCache: r.character.level,
      totalXpCache: r.character.totalXp,
      classKey: r.characterClass?.key ?? null,
      updatedAt: new Date(),
    })
    .where(eq(characters.userId, userId));

  // титулы: ровно те, что выводит движок (удалённые записи могут забрать титул)
  const earned = r.titles.map((t) => t.key);
  await tx
    .delete(userTitles)
    .where(
      earned.length > 0
        ? and(eq(userTitles.userId, userId), notInArray(userTitles.titleKey, earned))
        : eq(userTitles.userId, userId),
    );
  if (r.titles.length > 0) {
    // справочник титулов: миграция-сид его заполняет, но пересчёт не должен зависеть от того, применена ли она
    await tx
      .insert(titles)
      .values(
        r.titles
          .map((t) => titleDef(t.key))
          .filter((d): d is NonNullable<typeof d> => Boolean(d))
          .map((d) => ({ key: d.key, nameRu: d.ru, nameEn: d.en, rule: d.rule })),
      )
      .onConflictDoNothing();
    await tx
      .insert(userTitles)
      .values(r.titles.map((t) => ({ userId, titleKey: t.key, earnedAt: new Date(`${t.earnedOn}T12:00:00Z`) })))
      .onConflictDoUpdate({
        target: [userTitles.userId, userTitles.titleKey],
        set: { earnedAt: sql`excluded.earned_at` },
      });
  }
  // носимый титул, которого больше нет, снимаем
  await tx
    .update(characters)
    .set({ titleKey: null })
    .where(
      earned.length > 0
        ? and(eq(characters.userId, userId), notInArray(characters.titleKey, earned))
        : eq(characters.userId, userId),
    );

  // навыки
  for (const s of Object.values(r.skills)) {
    await tx
      .update(skills)
      .set({
        xpCache: s.xp,
        levelCache: s.level,
        status: s.status === "pending" ? "active" : s.status,
        slot: s.slot,
        awakenedAt: day(s.awakenedOn),
        takenAt: s.takenOn
          ? sql`coalesce(${skills.takenAt}, ${`${s.takenOn}T00:00:00Z`}::timestamptz)`
          : sql`${skills.takenAt}`,
      })
      .where(and(eq(skills.id, s.id), eq(skills.userId, userId)));
  }

  // характеристики
  for (const a of Object.values(r.attributes)) {
    if (!a) continue;
    const values = {
      value: a.value,
      xpPool: a.pool,
      activeDaysSincePoint: a.activeDaysSincePoint,
      xpTotal: a.xpTotal,
      activeDaysTotal: a.activeDaysTotal,
      state: a.state,
      unfoldOfferedAt: day(a.unfoldOfferedOn),
      unfoldedAt: day(a.unfoldedOn),
    };
    await tx
      .insert(userAttributes)
      .values({ userId, attributeKey: a.key, ...values })
      .onConflictDoUpdate({
        target: [userAttributes.userId, userAttributes.attributeKey],
        set: values,
      });
  }

  for (const [general, parts] of Object.entries(r.attributeTagXp)) {
    for (const [part, xp] of Object.entries(parts ?? {})) {
      await tx
        .insert(attributeXpTags)
        .values({ userId, generalKey: general, partKey: part, xp: xp ?? 0 })
        .onConflictDoUpdate({
          target: [attributeXpTags.userId, attributeXpTags.generalKey, attributeXpTags.partKey],
          set: { xp: xp ?? 0 },
        });
    }
  }

  // кандидаты в навыки (название и теги ставит классификатор — их не трогаем)
  for (const c of Object.values(r.candidates)) {
    const values = {
      xpPool: c.xpPool,
      minutesTotal: Math.round(c.minutesTotal),
      daysSeen: c.daysSeen,
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
      offerStatus: c.offerStatus,
      offeredAt: day(c.offeredOn),
    };
    await tx
      .insert(skillCandidates)
      .values({ userId, clusterKey: c.cluster, ...values })
      .onConflictDoUpdate({
        target: [skillCandidates.userId, skillCandidates.clusterKey],
        set: values,
      });
  }

  // HP: пишем результат, входные поля (сон, самочувствие) не трогаем
  for (const h of Object.values(r.hpDays)) {
    const values = { hpMax: h.max, hpMorning: h.morning, hpCurrent: h.current, effects: h.effects };
    await tx
      .insert(hpDays)
      .values({ userId, date: h.date, ...values })
      .onConflictDoUpdate({ target: [hpDays.userId, hpDays.date], set: values });
  }
}

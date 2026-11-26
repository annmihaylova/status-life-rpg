/**
 * Запись результата движка в кэш-таблицы и леджер.
 * Всё пересчитывается целиком: леджер пользователя заменяется, агрегаты перезаписываются.
 */
import { and, eq, sql } from "drizzle-orm";
import { FORMULA_VERSION } from "@/lib/game/config";
import type { EngineResult } from "@/lib/game/engine/types";
import type { Tx } from "@/lib/db/client";
import {
  attributeXpTags,
  characters,
  hpDays,
  skillCandidates,
  skills,
  userAttributes,
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
      updatedAt: new Date(),
    })
    .where(eq(characters.userId, userId));

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

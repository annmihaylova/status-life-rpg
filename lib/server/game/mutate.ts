import "server-only";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { adminDb, withUser, type Tx } from "@/lib/db";
import { skillCandidates, skills } from "@/lib/db/schema";
import type { AttributeKey } from "@/lib/game/attributes";
import { replay } from "@/lib/game/engine/replay";
import type { EngineResult, GameEvent } from "@/lib/game/engine/types";
import { eventToMessage, xpMessage, type MessageTone } from "@/lib/game/messages";
import { loadEngineInput } from "./load";
import { recomputeUser } from "./recompute";

/** Готовая к показу строка «окна Системы». */
export interface UiSystemMessage {
  id: string;
  text: string;
  tone: MessageTone;
  /** для экрана level-up и раскрытия */
  kind: GameEvent["type"] | "xp";
}

export interface MutationResult {
  messages: UiSystemMessage[];
}

/**
 * Изменение данных пользователя + полный пересчёт.
 * Возвращает системные сообщения о том, что изменилось: новые события и полученный опыт.
 */
export async function mutateAndRecompute(
  userId: string,
  mutation: (tx: Tx) => Promise<void>,
): Promise<MutationResult> {
  const db = adminDb();
  const before = replay((await loadEngineInput(db, userId, new Date())).input);
  await withUser(userId, mutation);
  const { result: after } = await recomputeUser(db, userId);
  return { messages: await diffMessages(userId, before, after) };
}

export async function diffMessages(
  userId: string,
  before: EngineResult,
  after: EngineResult,
): Promise<UiSystemMessage[]> {
  const seen = new Set(before.events.map((e) => e.id));
  const fresh = after.events.filter((e) => !seen.has(e.id));
  const gained = after.character.totalXp - before.character.totalXp;
  if (fresh.length === 0 && gained < 0.5) return [];

  const db = adminDb();
  const [skillRows, candRows, t, tg] = await Promise.all([
    db.select({ id: skills.id, name: skills.name }).from(skills).where(eq(skills.userId, userId)),
    db
      .select({ cluster: skillCandidates.clusterKey, name: skillCandidates.suggestedName })
      .from(skillCandidates)
      .where(eq(skillCandidates.userId, userId)),
    getTranslations("system"),
    getTranslations("game"),
  ]);
  const skillName = new Map(skillRows.map((s) => [s.id, s.name]));
  const clusterName = new Map(candRows.map((c) => [c.cluster, c.name ?? c.cluster]));
  const names = {
    skill: (id: string) => skillName.get(id) ?? "?",
    cluster: (c: string) => clusterName.get(c) ?? c,
    attribute: (k: AttributeKey) => tg(`attributes.${k}`),
    rank: (r: string) => tg(`ranks.${r}`),
  };

  const out: UiSystemMessage[] = [];
  if (gained >= 0.5) {
    const m = xpMessage(gained);
    out.push({ id: m.id, text: t(m.key, m.values), tone: m.tone, kind: "xp" });
  }
  for (const e of fresh) {
    const m = eventToMessage(e, names);
    out.push({ id: m.id, text: t(m.key, m.values), tone: m.tone, kind: e.type });
  }
  return out;
}

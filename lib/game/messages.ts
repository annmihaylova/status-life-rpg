/**
 * Системные сообщения в стиле «окна Системы» (SPEC 2.8).
 * Движок отдаёт события; здесь они превращаются в ключ перевода + значения.
 * Тексты — в messages/{ru,en}.json, пространство имён "system".
 */
import type { AttributeKey, GeneralKey, PartKey } from "./attributes";
import { partsOf } from "./attributes";
import type { GameEvent, HpDayState } from "./engine/types";

/** normal — обычная строка; rare — звезда (отдельная анимация); epic — отдельный экран. */
export type MessageTone = "normal" | "rare" | "epic";

export interface SystemMessage {
  id: string;
  key: string;
  values: Record<string, string | number>;
  tone: MessageTone;
}

export interface MessageNames {
  skill: (id: string) => string;
  /** предложенное название навыка для кластера-кандидата */
  cluster: (cluster: string) => string;
  attribute: (key: AttributeKey) => string;
  rank: (rank: string) => string;
  title: (key: string) => string;
  className: (key: string) => string;
}

export function eventToMessage(e: GameEvent, n: MessageNames): SystemMessage {
  const base = { id: e.id };
  switch (e.type) {
    case "level_up":
      return { ...base, key: "levelUp", values: { from: e.from, to: e.to }, tone: "epic" };
    case "slot_unlocked":
      return {
        ...base,
        key: e.slot === "main" ? "slotUnlockedMain" : "slotUnlockedSecondary",
        values: { total: e.total },
        tone: "normal",
      };
    case "skill_level_up":
      return {
        ...base,
        key: "skillLevelUp",
        values: { skill: n.skill(e.skillId), from: e.from, to: e.to },
        tone: "normal",
      };
    case "skill_rank_up":
      return {
        ...base,
        key: "skillRankUp",
        values: { skill: n.skill(e.skillId), rank: n.rank(e.rank) },
        tone: "normal",
      };
    case "skill_awakened":
      return { ...base, key: "skillAwakened", values: { skill: n.skill(e.skillId) }, tone: "normal" };
    case "skill_offer":
      return { ...base, key: "skillOffer", values: { skill: n.cluster(e.cluster) }, tone: "normal" };
    case "specialization_available":
      return {
        ...base,
        key: "specializationAvailable",
        values: { skill: n.skill(e.skillId), milestone: e.milestone },
        tone: "normal",
      };
    case "attribute_star":
      return {
        ...base,
        key: "attributeStar",
        values: { attribute: n.attribute(e.attribute), stars: e.stars },
        tone: "rare",
      };
    case "attribute_point":
      return {
        ...base,
        key: "attributePoint",
        values: { attribute: n.attribute(e.attribute), from: e.from, to: e.to },
        tone: "epic",
      };
    case "unfold_available":
      return {
        ...base,
        key: "unfoldAvailable",
        values: {
          attribute: n.attribute(e.general),
          parts: partsOf(e.general).map(n.attribute).join(" · "),
        },
        tone: "rare",
      };
    case "unfolded":
      return {
        ...base,
        key: "unfolded",
        values: {
          attribute: n.attribute(e.general),
          values: formatParts(e.general, e.values, n),
        },
        tone: "epic",
      };
    case "title_earned":
      return { ...base, key: "titleEarned", values: { title: n.title(e.title) }, tone: "rare" };
    case "class_unlocked":
      return { ...base, key: "classUnlocked", values: { class: n.className(e.classKey) }, tone: "epic" };
    case "side_class_taken":
      return { ...base, key: "sideClassTaken", values: { class: n.className(e.classKey) }, tone: "rare" };
    case "class_changed":
      return {
        ...base,
        key: "classChanged",
        values: { from: n.className(e.from), to: n.className(e.classKey) },
        tone: "rare",
      };
  }
}

function formatParts(
  g: GeneralKey,
  values: Partial<Record<PartKey, number>>,
  n: MessageNames,
): string {
  return partsOf(g)
    .map((p) => ({ p, v: values[p] ?? 0 }))
    .sort((a, b) => b.v - a.v)
    .map(({ p, v }) => `${n.attribute(p)} ${v}`)
    .join(" · ");
}

export function xpMessage(amount: number): SystemMessage {
  return {
    id: `xp:${Math.round(amount)}`,
    key: "xpGained",
    values: { amount: Math.round(amount) },
    tone: "normal",
  };
}

/** Строка про HP: значение, активные эффекты и мягкий совет отдохнуть при HP < 30%. */
export function hpMessage(hp: HpDayState, effectName: (e: string) => string): SystemMessage {
  const effects = hp.effects.map(effectName).join(", ");
  const key = hp.suggestRest ? "hpRest" : effects ? "hpWithEffects" : "hp";
  return {
    id: `hp:${hp.date}:${hp.current}`,
    key,
    values: { current: hp.current, max: hp.max, effects },
    tone: "normal",
  };
}

/** Все ключи, которые могут вернуть функции выше (для проверки переводов). */
export const SYSTEM_MESSAGE_KEYS = [
  "xpGained",
  "levelUp",
  "slotUnlockedMain",
  "slotUnlockedSecondary",
  "skillLevelUp",
  "skillRankUp",
  "skillAwakened",
  "skillOffer",
  "specializationAvailable",
  "attributeStar",
  "attributePoint",
  "unfoldAvailable",
  "unfolded",
  "hp",
  "hpWithEffects",
  "hpRest",
  "titleEarned",
  "classUnlocked",
  "classChanged",
  "sideClassTaken",
] as const;

import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";
import { ATTRIBUTES } from "./attributes";
import { GAME_CONFIG } from "./config";
import type { GameEvent } from "./engine/types";
import { className, titleName } from "./progression";
import { eventToMessage, hpMessage, SYSTEM_MESSAGE_KEYS, xpMessage, type SystemMessage } from "./messages";

const names = {
  skill: (id: string) => `skill:${id}`,
  cluster: (c: string) => `cluster:${c}`,
  attribute: (k: string) => ru.game.attributes[k as keyof typeof ru.game.attributes],
  rank: (r: string) => ru.game.ranks[r as keyof typeof ru.game.ranks],
  title: (k: string) => titleName(k, "ru"),
  className: (k: string) => className(k, "ru"),
};

const sample: GameEvent[] = [
  { id: "1", date: "2026-01-01", type: "level_up", from: 11, to: 12 },
  { id: "2", date: "2026-01-01", type: "slot_unlocked", slot: "main", total: 5 },
  { id: "3", date: "2026-01-01", type: "slot_unlocked", slot: "secondary", total: 7 },
  { id: "4", date: "2026-01-01", type: "skill_level_up", skillId: "bio", from: 6, to: 7 },
  { id: "5", date: "2026-01-01", type: "skill_rank_up", skillId: "bio", rank: "apprentice" },
  { id: "6", date: "2026-01-01", type: "skill_awakened", skillId: "skate" },
  { id: "7", date: "2026-01-01", type: "skill_offer", cluster: "research" },
  { id: "8", date: "2026-01-01", type: "specialization_available", skillId: "bio", milestone: 25 },
  { id: "9", date: "2026-01-01", type: "attribute_star", attribute: "mind", stars: 7 },
  { id: "10", date: "2026-01-01", type: "attribute_point", attribute: "mind", from: 17, to: 18 },
  { id: "11", date: "2026-01-01", type: "unfold_available", general: "mind" },
  {
    id: "12",
    date: "2026-01-01",
    type: "unfolded",
    general: "mind",
    values: { intellect: 21, will: 18, perception: 16 },
  },
];

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("системные сообщения", () => {
  it("каждое событие превращается в сообщение с переводом на обоих языках", () => {
    const msgs: SystemMessage[] = [
      ...sample.map((e) => eventToMessage(e, names)),
      xpMessage(412),
      hpMessage(
        {
          date: "2026-01-01",
          max: 120,
          morning: 120,
          current: 30,
          effects: ["overload"],
          suggestRest: true,
          restDay: false,
        },
        (e) => ru.game.effects[e as keyof typeof ru.game.effects],
      ),
    ];
    for (const m of msgs) {
      const ruText = ru.system[m.key as keyof typeof ru.system];
      const enText = en.system[m.key as keyof typeof en.system];
      expect(ruText, m.key).toBeTypeOf("string");
      expect(enText, m.key).toBeTypeOf("string");
      for (const p of placeholders(ruText)) expect(m.values, `${m.key}.${p}`).toHaveProperty(p);
      expect(placeholders(enText)).toEqual(placeholders(ruText));
    }
  });

  it("все ключи сообщений переведены, плейсхолдеры совпадают", () => {
    for (const k of SYSTEM_MESSAGE_KEYS) {
      expect(placeholders(en.system[k])).toEqual(placeholders(ru.system[k]));
    }
  });

  it("раскрытие перечисляет части по убыванию", () => {
    const m = eventToMessage(sample[11], names);
    expect(m.values.values).toBe("Интеллект 21 · Воля 18 · Восприятие 16");
    expect(m.tone).toBe("epic");
  });

  it("звезда — редкое событие, очко — торжественное", () => {
    expect(eventToMessage(sample[8], names).tone).toBe("rare");
    expect(eventToMessage(sample[9], names).tone).toBe("epic");
  });

  it("переведены все характеристики, ранги и эффекты", () => {
    for (const a of ATTRIBUTES) {
      expect(ru.game.attributes).toHaveProperty(a.key);
      expect(en.game.attributes).toHaveProperty(a.key);
    }
    for (const r of GAME_CONFIG.ranks) {
      expect(ru.game.ranks).toHaveProperty(r.key);
      expect(en.game.ranks).toHaveProperty(r.key);
    }
  });
});

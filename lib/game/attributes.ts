import data from "./data/attributes.json";

export const GENERAL_KEYS = ["body", "mind", "spirit"] as const;
export type GeneralKey = (typeof GENERAL_KEYS)[number];

export const PART_KEYS = [
  "strength",
  "dexterity",
  "endurance",
  "intellect",
  "perception",
  "will",
  "charisma",
  "empathy",
  "creativity",
] as const;
export type PartKey = (typeof PART_KEYS)[number];

export type AttributeKey = GeneralKey | PartKey;

export interface AttributeDef {
  key: AttributeKey;
  parent: GeneralKey | null;
  name_ru: string;
  name_en: string;
  short_ru?: string;
  short_en?: string;
  description_ru?: string;
  description_en?: string;
  sort_order: number;
}

export const ATTRIBUTES: readonly AttributeDef[] = [
  ...data.general.map((a) => ({ ...a, key: a.key as GeneralKey, parent: null })),
  ...data.parts.map((a) => ({
    ...a,
    key: a.key as PartKey,
    parent: a.parent as GeneralKey,
  })),
];

const PARENT: Record<PartKey, GeneralKey> = Object.fromEntries(
  data.parts.map((p) => [p.key, p.parent]),
) as Record<PartKey, GeneralKey>;

export function isGeneralKey(k: string): k is GeneralKey {
  return (GENERAL_KEYS as readonly string[]).includes(k);
}

export function isPartKey(k: string): k is PartKey {
  return (PART_KEYS as readonly string[]).includes(k);
}

export function parentOf(part: PartKey): GeneralKey {
  return PARENT[part];
}

export function partsOf(general: GeneralKey): PartKey[] {
  return PART_KEYS.filter((p) => PARENT[p] === general);
}

/**
 * Куда сейчас фактически идёт XP / откуда берётся значение для тега навыка.
 * Пока общая характеристика не раскрыта, тег «Ловкость» читается как «Тело» (SPEC 2.4.5).
 */
export function resolveAttribute(
  tag: PartKey,
  unfolded: ReadonlySet<GeneralKey>,
): AttributeKey {
  const parent = parentOf(tag);
  return unfolded.has(parent) ? tag : parent;
}

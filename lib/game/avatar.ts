/**
 * 2D-персонаж: параметры внешности (SPEC 6.2 — до VRM в фазе 4).
 * Хранится в characters.avatar_config. Только оригинальная графика, без чужих ассетов.
 */
import { z } from "zod";

export const SKIN_TONES = ["#fde3d0", "#f6d0b1", "#eec09a", "#d9a179", "#c18660", "#9c6644", "#7a4b2e", "#5a3520"] as const;
export const HAIR_COLORS = [
  "#1b1a1f", "#3b2a20", "#6b4428", "#8c3b24", "#c8642e", "#e2b863", "#efe3c2",
  "#9a9aa3", "#f1f1f4", "#e98bb5", "#a98be6", "#4f7ee8", "#5fcdb4",
] as const;
export const EYE_COLORS = ["#5b3a22", "#8a6a2f", "#3f8a4f", "#3b7fd1", "#7f8a99", "#d08a1e", "#8b5fd6", "#c0392b"] as const;
export const OUTFIT_COLORS = [
  "#2b2d42", "#f2f2f5", "#8b93ff", "#6fb4ff", "#5fcdb4", "#7bc96f", "#ffd46b",
  "#ff9b5c", "#ff5c7a", "#c38bff", "#8c6a4f", "#4a4e69",
] as const;
export const AURA_COLORS = ["#8b93ff", "#ff9b5c", "#6fb4ff", "#c38bff", "#5fcdb4", "#ffd46b", "#ff5c7a", "#e8e8f2"] as const;

export const HAIR_STYLES = ["short", "bob", "long", "ponytail", "bun", "curly", "buzz", "sidepart", "bald"] as const;
export const EYE_SHAPES = ["round", "almond"] as const;
export const EXPRESSIONS = ["smile", "calm", "grin"] as const;
export const OUTFITS = ["tee", "hoodie", "shirt", "sweater", "jacket", "dress", "labcoat", "sport"] as const;
export const ACCESSORIES = ["glasses_round", "glasses_square", "earrings", "headphones", "cap", "headband", "freckles", "blush"] as const;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

/**
 * 3D-модели (фаза 4). Базовые — VRoidPreset A–C (лицензии: assets/avatars/LICENSES.md),
 * показываются как есть. Своя — .vrm из VRoid Studio, лежит в Storage (фаза 4b).
 */
export const BASE_MODEL_KEYS = ["a", "b", "c", "z"] as const;
export type BaseModelKey = (typeof BASE_MODEL_KEYS)[number];
export const BASE_MODELS: readonly { key: BaseModelKey; url: string; look: "feminine" | "masculine" }[] = [
  { key: "a", url: "/models/avatar-sample-a.vrm", look: "feminine" },
  { key: "b", url: "/models/avatar-sample-b.vrm", look: "feminine" },
  { key: "c", url: "/models/avatar-sample-c.vrm", look: "masculine" },
  { key: "z", url: "/models/avatar-sample-z.vrm", look: "masculine" },
];

export const model3dSchema = z
  .discriminatedUnion("source", [
    z.object({ source: z.literal("base"), key: z.enum(BASE_MODEL_KEYS) }),
    // путь в бакете vrm-user: <userId>/<версия>.vrm
    z.object({ source: z.literal("custom"), path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-z-]{1,40}\.vrm$/) }),
  ])
  .nullable();
export type Model3d = z.infer<typeof model3dSchema>;

export function baseModelUrl(key: BaseModelKey): string {
  return BASE_MODELS.find((m) => m.key === key)!.url;
}

export const avatarSchema = z.object({
  skin: hex,
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: hex,
  eyeShape: z.enum(EYE_SHAPES),
  eyeColor: hex,
  expression: z.enum(EXPRESSIONS),
  outfit: z.enum(OUTFITS),
  outfitColor: hex,
  accessories: z.array(z.enum(ACCESSORIES)).max(4),
  aura: hex,
  /** null — 2D-портрет */
  model3d: model3dSchema.default(null),
});

export type AvatarConfig = z.infer<typeof avatarSchema>;

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: SKIN_TONES[1],
  hairStyle: "bob",
  hairColor: HAIR_COLORS[1],
  eyeShape: "round",
  eyeColor: EYE_COLORS[0],
  expression: "smile",
  outfit: "hoodie",
  outfitColor: OUTFIT_COLORS[2],
  accessories: [],
  aura: AURA_COLORS[0],
  model3d: null,
};

/** Сохранённая конфигурация или значения по умолчанию (старые/битые данные не ломают экран). */
export function parseAvatar(raw: unknown): AvatarConfig {
  const merged = { ...DEFAULT_AVATAR, ...(typeof raw === "object" && raw ? raw : {}) };
  const r = avatarSchema.safeParse(merged);
  if (r.success) return r.data;
  // битая 3D-ссылка не должна сбрасывать 2D-внешность
  const without = avatarSchema.safeParse({ ...merged, model3d: null });
  return without.success ? without.data : DEFAULT_AVATAR;
}

/** Затемнить/осветлить цвет: amount от -1 до 1. */
export function shade(color: string, amount: number): string {
  const n = parseInt(color.slice(1), 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    const v = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount;
    return Math.round(Math.max(0, Math.min(255, v)));
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

/** Контрастный цвет текста/деталей на заливке (для пуговиц, шнурков и т.п.). */
export function isLight(color: string): boolean {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}

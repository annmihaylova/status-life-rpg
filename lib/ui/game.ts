/** Общие помощники отображения для экранов (без игровой логики). */
import { isPartKey, parentOf, resolveAttribute, type AttributeKey, type GeneralKey } from "@/lib/game/attributes";

const COLORS: Record<GeneralKey, string> = {
  body: "var(--attr-body)",
  mind: "var(--attr-mind)",
  spirit: "var(--attr-spirit)",
};

export function attrColor(key: AttributeKey): string {
  return COLORS[isPartKey(key) ? parentOf(key) : key];
}

/**
 * Теги навыка по текущему состоянию (SPEC 2.4.5): «(Разум)» до раскрытия, «(Инт · Вол)» после.
 * Одинаковые общие характеристики не повторяются.
 */
export function tagLabel(
  primary: string | null,
  secondary: string | null,
  unfolded: ReadonlySet<GeneralKey>,
  short: (k: AttributeKey) => string,
): string {
  const resolved = [primary, secondary]
    .filter((x): x is string => Boolean(x) && isPartKey(x as string))
    .map((p) => resolveAttribute(p as Parameters<typeof resolveAttribute>[0], unfolded));
  const unique = [...new Set(resolved)];
  return unique.length ? unique.map(short).join(" · ") : "";
}

export function formatHours(minutes: number, locale: string): string {
  const h = minutes / 60;
  return h >= 10 ? Math.round(h).toLocaleString(locale) : h.toLocaleString(locale, { maximumFractionDigits: 1 });
}

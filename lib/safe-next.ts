/**
 * Куда вернуть после входа. Только пути этого сайта: «/…», без «//» и «/\» (иначе открытый редирект).
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(value)) return "/";
  return value;
}

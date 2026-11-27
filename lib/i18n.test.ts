import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
}

describe("переводы", () => {
  it("ru и en содержат одинаковые ключи", () => {
    expect(keys(en).sort()).toEqual(keys(ru).sort());
  });

  it("плейсхолдеры совпадают в каждой строке", () => {
    const get = (o: unknown, path: string) =>
      path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown>)[k], o) as string;
    for (const k of keys(ru)) {
      expect(placeholders(get(en, k)), k).toEqual(placeholders(get(ru, k)));
    }
  });
});

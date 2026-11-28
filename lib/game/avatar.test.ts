import { describe, expect, it } from "vitest";
import { avatarSchema, DEFAULT_AVATAR, isLight, parseAvatar, shade } from "./avatar";

describe("внешность персонажа", () => {
  it("значения по умолчанию проходят проверку", () => {
    expect(avatarSchema.safeParse(DEFAULT_AVATAR).success).toBe(true);
  });

  it("пустые и битые данные превращаются в значения по умолчанию", () => {
    expect(parseAvatar({})).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar(null)).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar({ hairStyle: "mohawk-of-doom" })).toEqual(DEFAULT_AVATAR);
  });

  it("частичная конфигурация дополняется", () => {
    const a = parseAvatar({ hairStyle: "curly", hairColor: "#e98bb5" });
    expect(a.hairStyle).toBe("curly");
    expect(a.outfit).toBe(DEFAULT_AVATAR.outfit);
  });

  it("цвета: затемнение, осветление и яркость", () => {
    expect(shade("#808080", -0.5)).toBe("#404040");
    expect(shade("#000000", 1)).toBe("#ffffff");
    expect(isLight("#f2f2f5")).toBe(true);
    expect(isLight("#2b2d42")).toBe(false);
  });
});

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

describe("3D-модель в конфиге", () => {
  it("по умолчанию — 2D; базовая и своя модели проходят проверку", () => {
    expect(parseAvatar({}).model3d).toBeNull();
    expect(parseAvatar({ model3d: { source: "base", key: "b" } }).model3d).toEqual({ source: "base", key: "b" });
    const path = "0b5c2f4e-1111-4222-8333-444455556666/v1.vrm";
    expect(parseAvatar({ model3d: { source: "custom", path } }).model3d).toEqual({ source: "custom", path });
  });

  it("чужой путь или неизвестная база сбрасывают только 3D, 2D-внешность сохраняется", () => {
    const bad = parseAvatar({ hairStyle: "long", model3d: { source: "custom", path: "../etc/passwd" } });
    expect(bad.model3d).toBeNull();
    expect(bad.hairStyle).toBe("long");
    expect(parseAvatar({ model3d: { source: "base", key: "z" } }).model3d).toBeNull();
  });
});

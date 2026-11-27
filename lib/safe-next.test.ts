import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("пропускает пути сайта", () => {
    expect(safeNext("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc");
    expect(safeNext("/")).toBe("/");
  });
  it("не пускает внешние адреса и мусор", () => {
    for (const v of ["https://evil.test", "//evil.test", "/\\evil.test", "evil", "/a\nb", null, 5, "/" + "x".repeat(3000)]) {
      expect(safeNext(v)).toBe("/");
    }
  });
});

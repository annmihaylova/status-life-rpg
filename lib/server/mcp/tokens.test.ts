import { describe, expect, it } from "vitest";
import { tokenFromHeaders } from "./tokens";

const h = (v: Record<string, string>) => new Headers(v);

describe("ключ из заголовков", () => {
  it("Bearer, без Bearer, с пробелами и кавычками по краям", () => {
    expect(tokenFromHeaders(h({ authorization: "Bearer sts_abc" }))).toBe("sts_abc");
    expect(tokenFromHeaders(h({ authorization: "  bearer   sts_abc  " }))).toBe("sts_abc");
    expect(tokenFromHeaders(h({ authorization: "sts_abc" }))).toBe("sts_abc");
    expect(tokenFromHeaders(h({ authorization: '"Bearer sts_abc"' }))).toBe("sts_abc");
    expect(tokenFromHeaders(h({ "x-api-key": " sts_abc " }))).toBe("sts_abc");
    expect(tokenFromHeaders(h({}))).toBeNull();
    expect(tokenFromHeaders(h({ authorization: "Basic xyz" }))).toBeNull();
  });
});

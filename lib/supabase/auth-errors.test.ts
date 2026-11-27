import { describe, expect, it } from "vitest";
import ru from "../../messages/ru.json";
import en from "../../messages/en.json";
import { authErrorKey } from "./auth-errors";

describe("authErrorKey", () => {
  it("hourly project mail limit", () => {
    expect(
      authErrorKey({
        code: "over_email_send_rate_limit",
        status: 429,
        message: "email rate limit exceeded",
      }),
    ).toBe("errors.rateLimit");
  });

  it("per-address resend cooldown uses the same code", () => {
    expect(
      authErrorKey({
        code: "over_email_send_rate_limit",
        status: 429,
        message: "For security purposes, you can only request this after 42 seconds.",
      }),
    ).toBe("errors.tooOften");
  });

  it("other known codes and bare 429", () => {
    expect(authErrorKey({ code: "email_address_not_authorized", message: "x" })).toBe(
      "errors.notAuthorized",
    );
    expect(authErrorKey({ code: "otp_expired", message: "x" })).toBe("errors.invalidCode");
    expect(authErrorKey({ status: 429, message: "x" })).toBe("errors.tooOften");
  });

  it("unknown errors fall through", () => {
    expect(authErrorKey({ code: "something_else", status: 400, message: "x" })).toBeNull();
  });

  it("every key has ru and en text", () => {
    for (const key of ["rateLimit", "tooOften", "notAuthorized", "invalidCode"] as const) {
      expect(ru.login.errors[key]).toBeTruthy();
      expect(en.login.errors[key]).toBeTruthy();
    }
  });
});

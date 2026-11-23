import type { BetterAuthOptions } from "better-auth";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({ db: {} }));
vi.mock("../lib/mail.js", () => ({ sendEmail: vi.fn() }));

const { auth } = await import("../lib/auth.js");
// Widen to the full option type: the inferred literal omits keys we assert are absent.
const options: BetterAuthOptions = auth.options;

describe("Better Auth config", () => {
  it("keeps the OAuth state cookie check (no login CSRF on Google sign-in)", () => {
    // Without the signed state cookie, any browser holding an attacker's
    // callback URL (state + code) gets logged into the attacker's account.
    expect(options.account?.skipStateCookieCheck).not.toBe(true);
  });

  it("revokes existing sessions when a password is reset", () => {
    expect(options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(
      true,
    );
  });

  it("does not let email OTP create accounts or mail non-users", () => {
    // Without disableSignUp, POST /sign-in/email-otp auto-creates a verified
    // user and send-verification-otp {type:"sign-in"} mails any address.
    const emailOtp = options.plugins?.find((p) => p.id === "email-otp") as
      | { options?: { disableSignUp?: boolean } }
      | undefined;
    expect(emailOtp?.options?.disableSignUp).toBe(true);
  });

  it("keys the IP limiter on X-Forwarded-For, which the app rewrites", () => {
    expect(options.advanced?.ipAddress?.ipAddressHeaders).toEqual([
      "x-forwarded-for",
    ]);
    expect(options.advanced?.ipAddress?.disableIpTracking).not.toBe(true);
  });
});

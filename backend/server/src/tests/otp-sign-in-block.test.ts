import { describe, expect, it } from "vitest";
import { isBlockedOtpSignInRequest } from "../lib/block-native-sign-up.js";

describe("isBlockedOtpSignInRequest", () => {
  it("blocks sign-in by email OTP", () => {
    expect(
      isBlockedOtpSignInRequest("POST", "/api/auth/sign-in/email-otp", {
        email: "a@b.co",
        otp: "123456",
      }),
    ).toBe(true);
    expect(
      isBlockedOtpSignInRequest("post", "/API/auth/Sign-In/Email-OTP/", {}),
    ).toBe(true);
  });

  it("blocks sending a sign-in code, whoever the address belongs to", () => {
    expect(
      isBlockedOtpSignInRequest(
        "POST",
        "/api/auth/email-otp/send-verification-otp",
        { email: "stranger@example.com", type: "sign-in" },
      ),
    ).toBe(true);
  });

  it("keeps the OTP flows the SPA uses", () => {
    for (const type of ["email-verification", "forget-password"]) {
      expect(
        isBlockedOtpSignInRequest(
          "POST",
          "/api/auth/email-otp/send-verification-otp",
          { email: "a@b.co", type },
        ),
      ).toBe(false);
    }
    expect(
      isBlockedOtpSignInRequest("POST", "/api/auth/email-otp/verify-email", {
        email: "a@b.co",
        otp: "123456",
      }),
    ).toBe(false);
    expect(
      isBlockedOtpSignInRequest(
        "POST",
        "/api/auth/email-otp/request-password-reset",
        { email: "a@b.co" },
      ),
    ).toBe(false);
    expect(
      isBlockedOtpSignInRequest("POST", "/api/auth/sign-in/email", {
        email: "a@b.co",
        password: "x",
      }),
    ).toBe(false);
  });
});

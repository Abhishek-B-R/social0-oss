import type { Ratelimit } from "@upstash/ratelimit";
import { describe, expect, it, vi } from "vitest";
import {
  authEmailRateLimitKind,
  authRequestEmail,
  enforceAuthEmailRateLimit,
  recordAuthEmailOutcome,
  type AuthEmailLimiters,
} from "../lib/auth-email-rate-limit.js";

/** In-memory fixed-budget stand-in for an Upstash Ratelimit. */
function fakeLimiter(tokens: number) {
  const used = new Map<string, number>();
  const reset = Date.now() + 60_000;
  const limit = vi.fn(async (key: string) => {
    const n = used.get(key) ?? 0;
    const success = n < tokens;
    if (success) used.set(key, n + 1);
    return {
      success,
      limit: tokens,
      remaining: Math.max(0, tokens - (success ? n + 1 : n)),
      reset,
      pending: Promise.resolve(),
    };
  });
  const getRemaining = vi.fn(async (key: string) => ({
    remaining: Math.max(0, tokens - (used.get(key) ?? 0)),
    reset,
    limit: tokens,
  }));
  const resetUsedTokens = vi.fn(async (key: string) => {
    used.delete(key);
  });
  return {
    limiter: { limit, getRemaining, resetUsedTokens } as unknown as Ratelimit,
    limit,
    getRemaining,
    resetUsedTokens,
    used,
  };
}

function fakeLimiters() {
  const signInClient = fakeLimiter(10);
  const signInEmail = fakeLimiter(100);
  const otpClient = fakeLimiter(5);
  const otpEmail = fakeLimiter(30);
  const verifyClient = fakeLimiter(10);
  const verifyEmail = fakeLimiter(20);
  const limiters: AuthEmailLimiters = {
    sign_in_password: {
      client: signInClient.limiter,
      email: signInEmail.limiter,
    },
    otp_send: { client: otpClient.limiter, email: otpEmail.limiter },
    otp_verify: { client: verifyClient.limiter, email: verifyEmail.limiter },
  };
  return {
    limiters,
    signInClient,
    signInEmail,
    otpClient,
    otpEmail,
    verifyClient,
    verifyEmail,
  };
}

const SIGN_IN = "/api/auth/sign-in/email";
const RESET = "/api/auth/email-otp/request-password-reset";
const SEND_VERIFICATION_EMAIL = "/api/auth/send-verification-email";
const RESET_PASSWORD = "/api/auth/email-otp/reset-password";
const ATTACKER = "198.51.100.66";
const VICTIM_IP = "203.0.113.7";

/** Runs the gate, then (if allowed) records what Better Auth would answer. */
async function signIn(
  limiters: AuthEmailLimiters,
  ip: string,
  betterAuthStatus: number,
  email = "victim@example.com",
) {
  const body = { email, password: "x" };
  const gate = await enforceAuthEmailRateLimit("POST", SIGN_IN, body, ip, limiters);
  if (!gate.allowed) return gate;
  await recordAuthEmailOutcome("POST", SIGN_IN, body, ip, betterAuthStatus, limiters);
  return gate;
}

describe("authEmailRateLimitKind", () => {
  it("covers password sign-in and every OTP-sending endpoint", () => {
    expect(authEmailRateLimitKind("POST", SIGN_IN)).toBe("sign_in_password");
    for (const path of [
      "/api/auth/email-otp/send-verification-otp",
      RESET,
      "/api/auth/forget-password/email-otp",
      // Better Auth core route: mints an email-verification OTP (regression).
      SEND_VERIFICATION_EMAIL,
    ]) {
      expect(authEmailRateLimitKind("POST", path)).toBe("otp_send");
    }
  });

  it("covers every endpoint that accepts an OTP", () => {
    for (const path of [
      "/api/auth/email-otp/verify-email",
      "/api/auth/email-otp/check-verification-otp",
      RESET_PASSWORD,
    ]) {
      expect(authEmailRateLimitKind("POST", path)).toBe("otp_verify");
    }
  });

  it("leaves other auth traffic alone", () => {
    expect(authEmailRateLimitKind("GET", "/api/auth/get-session")).toBeNull();
    expect(authEmailRateLimitKind("GET", SIGN_IN)).toBeNull();
    expect(authEmailRateLimitKind("POST", "/api/auth/sign-in/social")).toBeNull();
    expect(authEmailRateLimitKind("POST", "/v1/sign-in/email")).toBeNull();
  });
});

describe("authRequestEmail", () => {
  it("normalizes case and whitespace so variants share one bucket", () => {
    expect(authRequestEmail({ email: "  Victim@Example.COM " })).toBe(
      "victim@example.com",
    );
    expect(authRequestEmail({ email: "" })).toBeNull();
    expect(authRequestEmail({ email: 5 })).toBeNull();
    expect(authRequestEmail(null)).toBeNull();
  });
});

describe("password sign-in limit", () => {
  it("keys the tight bucket on email + caller IP and peeks before Better Auth", async () => {
    const f = fakeLimiters();
    await enforceAuthEmailRateLimit(
      "POST",
      SIGN_IN,
      { email: "Victim@example.com", password: "guess" },
      ATTACKER,
      f.limiters,
    );
    expect(f.signInClient.getRemaining).toHaveBeenCalledWith(
      `sign_in_password:victim@example.com:${ATTACKER}`,
    );
    expect(f.signInEmail.getRemaining).toHaveBeenCalledWith(
      "sign_in_password:victim@example.com",
    );
    // Checking costs nothing; only the outcome does.
    expect(f.signInClient.limit).not.toHaveBeenCalled();
    expect(f.signInEmail.limit).not.toHaveBeenCalled();
  });

  it("an attacker's wrong passwords do not lock the owner out (regression)", async () => {
    const f = fakeLimiters();
    for (let i = 0; i < 50; i++) await signIn(f.limiters, ATTACKER, 401);

    // The attacker is now blocked...
    expect(await signIn(f.limiters, ATTACKER, 401)).toMatchObject({
      allowed: false,
      status: 429,
    });
    // ...having spent only its own 10 tokens of the email-wide ceiling.
    expect(f.signInEmail.used.get("sign_in_password:victim@example.com")).toBe(10);
    // The owner, from their own IP, still gets through to Better Auth.
    expect(await signIn(f.limiters, VICTIM_IP, 200)).toMatchObject({
      allowed: true,
    });
  });

  it("counts only failures, and a success clears the caller's bucket", async () => {
    const f = fakeLimiters();
    const key = `sign_in_password:victim@example.com:${VICTIM_IP}`;
    for (let i = 0; i < 9; i++) await signIn(f.limiters, VICTIM_IP, 401);
    expect(f.signInClient.used.get(key)).toBe(9);

    // 403 (unverified), 400, 429 are not password guesses.
    for (const status of [403, 400, 429, 500]) {
      await signIn(f.limiters, VICTIM_IP, status);
    }
    expect(f.signInClient.used.get(key)).toBe(9);

    await signIn(f.limiters, VICTIM_IP, 200);
    expect(f.signInClient.resetUsedTokens).toHaveBeenCalledWith(key);
    expect(f.signInClient.used.has(key)).toBe(false);
    // The email-wide ceiling is not handed back on success.
    expect(f.signInEmail.used.get("sign_in_password:victim@example.com")).toBe(9);
  });

  it("still stops distributed guessing at the email-wide ceiling", async () => {
    const f = fakeLimiters();
    for (let ip = 0; ip < 10; ip++) {
      for (let i = 0; i < 10; i++) await signIn(f.limiters, `10.0.0.${ip}`, 401);
    }
    expect(await signIn(f.limiters, "10.0.1.1", 401)).toMatchObject({
      allowed: false,
      status: 429,
    });
  });
});

describe("OTP send limit", () => {
  it("junk reset requests from one IP do not block the owner's reset (regression)", async () => {
    const f = fakeLimiters();
    const body = { email: "victim@example.com" };
    for (let i = 0; i < 20; i++) {
      await enforceAuthEmailRateLimit("POST", RESET, body, ATTACKER, f.limiters);
    }
    await expect(
      enforceAuthEmailRateLimit("POST", RESET, body, ATTACKER, f.limiters),
    ).resolves.toMatchObject({ allowed: false, status: 429 });
    // A blocked caller never touches the email-wide bucket.
    expect(f.otpEmail.used.get("otp_send:victim@example.com")).toBe(5);

    await expect(
      enforceAuthEmailRateLimit("POST", RESET, body, VICTIM_IP, f.limiters),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("caps mail to one address from many IPs", async () => {
    const f = fakeLimiters();
    const body = { email: "victim@example.com" };
    for (let ip = 0; ip < 6; ip++) {
      for (let i = 0; i < 5; i++) {
        await enforceAuthEmailRateLimit("POST", RESET, body, `10.0.0.${ip}`, f.limiters);
      }
    }
    await expect(
      enforceAuthEmailRateLimit("POST", RESET, body, "10.0.1.1", f.limiters),
    ).resolves.toMatchObject({ allowed: false, status: 429 });
  });

  it("outcome recording ignores OTP sends", async () => {
    const f = fakeLimiters();
    await recordAuthEmailOutcome(
      "POST",
      RESET,
      { email: "victim@example.com" },
      ATTACKER,
      401,
      f.limiters,
    );
    expect(f.otpClient.limit).not.toHaveBeenCalled();
    expect(f.signInClient.limit).not.toHaveBeenCalled();
  });
});

describe("send-verification-email (regression)", () => {
  it("shares the OTP send buckets, so rotating IPs cannot mail-bomb an address", async () => {
    const f = fakeLimiters();
    const body = { email: "Victim@example.com" };
    for (let i = 0; i < 5; i++) {
      await expect(
        enforceAuthEmailRateLimit("POST", SEND_VERIFICATION_EMAIL, body, ATTACKER, f.limiters),
      ).resolves.toMatchObject({ allowed: true });
    }
    await expect(
      enforceAuthEmailRateLimit("POST", SEND_VERIFICATION_EMAIL, body, ATTACKER, f.limiters),
    ).resolves.toMatchObject({ allowed: false, status: 429 });
    expect(f.otpClient.limit.mock.calls[0]?.[0]).toBe(
      `otp_send:victim@example.com:${ATTACKER}`,
    );

    // The core route and the plugin's sends drain one email-wide ceiling.
    for (let ip = 0; ip < 5; ip++) {
      for (let i = 0; i < 5; i++) {
        const path = i % 2 ? SEND_VERIFICATION_EMAIL : RESET;
        await enforceAuthEmailRateLimit("POST", path, body, `10.0.0.${ip}`, f.limiters);
      }
    }
    await expect(
      enforceAuthEmailRateLimit("POST", SEND_VERIFICATION_EMAIL, body, "10.0.1.1", f.limiters),
    ).resolves.toMatchObject({ allowed: false, status: 429 });
  });
});

describe("OTP submission limit (regression)", () => {
  const guess = (limiters: AuthEmailLimiters, ip: string, path = RESET_PASSWORD) =>
    enforceAuthEmailRateLimit(
      "POST",
      path,
      { email: "victim@example.com", otp: "000000", password: "new-password" },
      ip,
      limiters,
    );

  it("caps guesses at one address per day, however many IPs and fresh codes", async () => {
    const f = fakeLimiters();
    let allowed = 0;
    // 30 IPs x 3 guesses: what 30 minted codes would allow without the cap.
    for (let ip = 0; ip < 30; ip++) {
      for (let i = 0; i < 3; i++) {
        const path = [
          RESET_PASSWORD,
          "/api/auth/email-otp/verify-email",
          "/api/auth/email-otp/check-verification-otp",
        ][i]!;
        if ((await guess(f.limiters, `10.0.${ip}.1`, path)).allowed) allowed++;
      }
    }
    expect(allowed).toBe(20);
    expect(f.verifyEmail.used.get("otp_verify:victim@example.com")).toBe(20);
  });

  it("charges up front, before Better Auth, and never via outcome recording", async () => {
    const f = fakeLimiters();
    await guess(f.limiters, ATTACKER);
    expect(f.verifyClient.limit.mock.calls[0]?.[0]).toBe(
      `otp_verify:victim@example.com:${ATTACKER}`,
    );
    expect(f.verifyEmail.limit.mock.calls[0]?.[0]).toBe(
      "otp_verify:victim@example.com",
    );

    await recordAuthEmailOutcome(
      "POST",
      RESET_PASSWORD,
      { email: "victim@example.com" },
      ATTACKER,
      400,
      f.limiters,
    );
    expect(f.verifyClient.limit).toHaveBeenCalledTimes(1);
  });

  it("one IP spends only its own client budget of the daily ceiling", async () => {
    const f = fakeLimiters();
    for (let i = 0; i < 25; i++) await guess(f.limiters, ATTACKER);
    expect(f.verifyEmail.used.get("otp_verify:victim@example.com")).toBe(10);
    await expect(guess(f.limiters, VICTIM_IP)).resolves.toMatchObject({
      allowed: true,
    });
  });
});

describe("pass-through", () => {
  it("skips untracked paths and bodies without an email", async () => {
    const f = fakeLimiters();
    await expect(
      enforceAuthEmailRateLimit("GET", "/api/auth/get-session", undefined, ATTACKER, f.limiters),
    ).resolves.toEqual({ allowed: true });
    await expect(
      enforceAuthEmailRateLimit("POST", SIGN_IN, {}, ATTACKER, f.limiters),
    ).resolves.toEqual({ allowed: true });
    expect(f.signInClient.getRemaining).not.toHaveBeenCalled();
  });

  it("fails open when Redis is not configured", async () => {
    const none: AuthEmailLimiters = {
      sign_in_password: { client: null, email: null },
      otp_send: { client: null, email: null },
      otp_verify: { client: null, email: null },
    };
    await expect(
      signIn(none, ATTACKER, 401),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      enforceAuthEmailRateLimit("POST", RESET, { email: "a@b.co" }, ATTACKER, none),
    ).resolves.toMatchObject({ allowed: true });
  });
});

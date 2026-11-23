/**
 * `/api/auth/sign-up` used to verify Turnstile only when the request carried a
 * `turnstileToken`, so with the secret configured a bot simply left the field
 * out, created accounts and had a verification code mailed from our domain to
 * any address it chose. A configured server now refuses a sign-up without a
 * valid token on that route as well.
 */

import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockSignUpEmail, mockFindUser } = vi.hoisted(() => ({
  mockEnv: {
    TURNSTILE_SECRET_KEY: "" as string | undefined,
    NEXT_PUBLIC_APP_URL: "https://social0.app",
  },
  mockSignUpEmail: vi.fn(),
  mockFindUser: vi.fn(),
}));

vi.mock("../lib/env.js", () => ({ env: mockEnv }));
vi.mock("../lib/auth.js", () => ({
  auth: { api: { signUpEmail: mockSignUpEmail } },
}));
vi.mock("../db/index.js", () => ({
  db: { query: { user: { findFirst: mockFindUser } } },
}));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  signUpIpLimiter: null,
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../lib/legal.js", () => ({
  validateSignupLegalConsent: () => null,
  recordLegalAcceptances: vi.fn(),
}));

import { runRouteHandler } from "../lib/run-route-handler.js";
import { signUpDev } from "../routes/api/auth-sign-up.js";

const SIGN_UP = {
  name: "Bot",
  email: "victim@example.com",
  password: "hunter2hunter2",
  acceptTerms: true,
  acceptPrivacy: true,
};

async function signUp(body: Record<string, unknown>) {
  const app = Fastify();
  app.post("/api/auth/sign-up", async (req, reply) => {
    await runRouteHandler(req, reply, (request) => signUpDev(request));
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up",
    payload: body,
  });
  await app.close();
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.TURNSTILE_SECRET_KEY = "turnstile-secret";
  mockFindUser.mockResolvedValue(undefined);
  // Stops the handler right after the captcha gate.
  mockSignUpEmail.mockRejectedValue(Object.assign(new Error("stop"), { status: 418 }));
});

afterEach(() => {
  fetchSpy.mockReset();
});

describe("POST /api/auth/sign-up with Turnstile configured", () => {
  it("refuses a sign-up that sends no token", async () => {
    const res = await signUp(SIGN_UP);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("turnstile_failed");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("refuses a token Cloudflare rejects", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );

    const res = await signUp({ ...SIGN_UP, turnstileToken: "forged" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("turnstile_failed");
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("lets a verified sign-up through to Better Auth", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await signUp({ ...SIGN_UP, turnstileToken: "solved" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockSignUpEmail).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/auth/sign-up without Turnstile configured", () => {
  it("does not ask for a captcha", async () => {
    mockEnv.TURNSTILE_SECRET_KEY = undefined;

    const res = await signUp(SIGN_UP);

    expect(res.body.code).not.toBe("turnstile_failed");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSignUpEmail).toHaveBeenCalledTimes(1);
  });
});

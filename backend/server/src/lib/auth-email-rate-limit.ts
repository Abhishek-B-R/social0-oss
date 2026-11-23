import { Ratelimit } from "@upstash/ratelimit";
import {
  enforceRateLimit,
  slidingWindowLimiter,
  type RateLimitResult,
} from "./ratelimit.js";
import { withRedisTimeout } from "./redis-safe.js";

/**
 * Redis limits on the Better Auth endpoints that guess a password or send
 * mail. Better Auth's own limiter is per IP and per process; these survive
 * PM2 restarts and are shared across instances.
 *
 * Every endpoint has two buckets, and neither is keyed on the email alone at a
 * tight limit, because anyone can send requests naming someone else's address:
 *
 * - `client`: (email + client IP), tight. Stops one caller hammering one
 *   account. An attacker exhausting it only blocks themselves.
 * - `email`: email only, loose. Stops distributed guessing / mail-bombing of
 *   one address. A single IP cannot drain it, because the client bucket is
 *   checked first and a request it rejects never touches the email bucket.
 *
 * Password sign-in counts only *failed* attempts (Better Auth 401): the
 * buckets are peeked before the request and charged afterwards, and a
 * successful sign-in clears that caller's client bucket. So junk passwords
 * sent by someone else never stop the owner's correct one.
 *
 * OTP sends and OTP submissions are charged up front, before Better Auth runs,
 * so concurrent requests cannot slip past a peek. The submission ceiling is
 * per day and is what actually bounds guessing a 6-digit code: Better Auth
 * allows 3 tries per code, but anyone can mint a new code for an address, so
 * the send limits alone still leave (sends x 3) guesses per hour.
 */
function limiter(
  tokens: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
  prefix: string,
): Ratelimit | null {
  return slidingWindowLimiter(tokens, window, prefix);
}

export type AuthEmailRateLimitKind =
  | "sign_in_password"
  | "otp_send"
  | "otp_verify";

export type AuthEmailLimiterPair = {
  client: Ratelimit | null;
  email: Ratelimit | null;
};

export type AuthEmailLimiters = Record<
  AuthEmailRateLimitKind,
  AuthEmailLimiterPair
>;

const LIMITERS: AuthEmailLimiters = {
  sign_in_password: {
    // Failed passwords per (email, IP).
    client: limiter(10, "15 m", "rl:auth_sign_in_email_ip"),
    // Failed passwords per email from all IPs: distributed guessing only.
    email: limiter(100, "15 m", "rl:auth_sign_in_email_all"),
  },
  otp_send: {
    // Verification / reset mails per (email, IP).
    client: limiter(5, "1 h", "rl:auth_otp_send_ip"),
    // Mails per address from all IPs: anti mail-bombing ceiling.
    email: limiter(30, "1 h", "rl:auth_otp_send_all"),
  },
  otp_verify: {
    // OTP submissions (right or wrong) per (email, IP).
    client: limiter(10, "1 h", "rl:auth_otp_verify_ip"),
    // OTP submissions per address from all IPs, per day: caps guesses at a
    // 6-digit code to ~20/day (~0.7% a year) however many codes get minted.
    email: limiter(20, "1 d", "rl:auth_otp_verify_all"),
  },
};

const KIND_BY_PATH: Record<string, AuthEmailRateLimitKind> = {
  "/sign-in/email": "sign_in_password",
  "/email-otp/send-verification-otp": "otp_send",
  "/email-otp/request-password-reset": "otp_send",
  "/forget-password/email-otp": "otp_send",
  // Better Auth core route. With `overrideDefaultEmailVerification` it mints
  // and mails an email-verification OTP for any unverified address, no session
  // needed. The SPA never calls it, but the catch-all still forwards it.
  "/send-verification-email": "otp_send",
  // Every endpoint that accepts an OTP for an address.
  "/email-otp/verify-email": "otp_verify",
  "/email-otp/check-verification-otp": "otp_verify",
  "/email-otp/reset-password": "otp_verify",
};

const AUTH_BASE_PATH = "/api/auth";

/** Which per-email limit (if any) covers this Better Auth request. */
export function authEmailRateLimitKind(
  method: string,
  pathname: string,
): AuthEmailRateLimitKind | null {
  if (method.toUpperCase() !== "POST") return null;
  if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return null;
  const sub = pathname.slice(AUTH_BASE_PATH.length).replace(/\/+$/, "");
  return KIND_BY_PATH[sub] ?? null;
}

/** Lower-cased, trimmed email from a JSON body, or null. */
export function authRequestEmail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const email = (body as { email?: unknown }).email;
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function bucketKeys(
  kind: AuthEmailRateLimitKind,
  email: string,
  ip: string | undefined,
): { client: string; email: string } {
  const caller = ip?.trim() || "anonymous";
  return { client: `${kind}:${email}:${caller}`, email: `${kind}:${email}` };
}

const TOO_MANY: RateLimitResult = {
  allowed: false,
  status: 429,
  error: "Too many requests. Try again later.",
};

/**
 * Whether a bucket still has a token, without spending one. Fails open (like
 * the consuming path below) when Redis is missing or slow.
 */
async function peek(
  bucket: Ratelimit | null,
  key: string,
): Promise<RateLimitResult> {
  if (!bucket) return { allowed: true };
  const state = await withRedisTimeout(
    `ratelimit-peek:${key}`,
    () => bucket.getRemaining(key),
    undefined,
  );
  if (!state || state.remaining > 0) return { allowed: true };
  return { ...TOO_MANY, limit: state.limit, remaining: 0, reset: state.reset };
}

/** Spends one token, client bucket first so a blocked caller never drains the email bucket. */
async function consume(
  pair: AuthEmailLimiterPair,
  keys: { client: string; email: string },
): Promise<RateLimitResult> {
  const options = { failClosedWhenUnavailable: false };
  const perClient = await enforceRateLimit(pair.client, keys.client, options);
  if (!perClient.allowed) return perClient;
  return enforceRateLimit(pair.email, keys.email, options);
}

/**
 * Gate for a Better Auth request, run before Better Auth sees it. Requests
 * without an email (Better Auth rejects those itself) and paths outside the
 * table pass. OTP sends and OTP submissions spend a token here; password
 * sign-in only checks that neither bucket is empty (see
 * `recordAuthEmailOutcome`).
 *
 * Fails open when Redis is unavailable: Better Auth's per-IP limiter still
 * applies, and a Redis blip must not lock every user out of sign-in.
 */
export async function enforceAuthEmailRateLimit(
  method: string,
  pathname: string,
  body: unknown,
  ip: string | undefined,
  limiters: AuthEmailLimiters = LIMITERS,
): Promise<RateLimitResult> {
  const kind = authEmailRateLimitKind(method, pathname);
  if (!kind) return { allowed: true };
  const email = authRequestEmail(body);
  if (!email) return { allowed: true };
  const pair = limiters[kind];
  const keys = bucketKeys(kind, email, ip);

  if (kind !== "sign_in_password") return consume(pair, keys);

  const perClient = await peek(pair.client, keys.client);
  if (!perClient.allowed) return perClient;
  return peek(pair.email, keys.email);
}

/**
 * Settles a password sign-in after Better Auth answered: a 401 (wrong email
 * or password) spends a token from both buckets; a success clears this
 * caller's client bucket. The email-wide bucket is left alone on success so
 * the owner signing in does not hand a distributed guesser a fresh budget.
 * Anything else (403 unverified, 400, 429, 5xx) is not a password guess and
 * is not counted.
 */
export async function recordAuthEmailOutcome(
  method: string,
  pathname: string,
  body: unknown,
  ip: string | undefined,
  status: number,
  limiters: AuthEmailLimiters = LIMITERS,
): Promise<void> {
  if (authEmailRateLimitKind(method, pathname) !== "sign_in_password") return;
  const email = authRequestEmail(body);
  if (!email) return;
  const pair = limiters.sign_in_password;
  const keys = bucketKeys("sign_in_password", email, ip);

  if (status === 401) {
    await consume(pair, keys);
    return;
  }
  if (status >= 200 && status < 300 && pair.client) {
    const client = pair.client;
    await withRedisTimeout(
      `ratelimit-reset:${keys.client}`,
      () => client.resetUsedTokens(keys.client),
      undefined,
    );
  }
}

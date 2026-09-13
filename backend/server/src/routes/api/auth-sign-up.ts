import { auth } from "../../lib/auth.js";
import { env } from "../../lib/env.js";
import {
  mapSignUpError,
  mapSignUpErrorFromResponse,
  EMAIL_ALREADY_EXISTS_MESSAGE,
} from "../../lib/sign-up-errors.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import { enforceRateLimit, signUpIpLimiter } from "../../lib/ratelimit.js";
import { clientIp } from "../../lib/client-ip.js";
import {
  recordLegalAcceptances,
  validateSignupLegalConsent,
} from "../../lib/legal.js";
import {
  isTurnstileConfigured,
  verifyTurnstileToken,
} from "../../lib/turnstile.js";
import { db } from "../../db/index.js";
import { user } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";
function emailAlreadyExistsResponse() {
  return RouteResponse.json(
    { error: EMAIL_ALREADY_EXISTS_MESSAGE, code: "EMAIL_ALREADY_EXISTS" },
    { status: 409 },
  );
}

async function findUserIdByNormalizedEmail(normalizedEmail: string) {
  const row = await db.query.user.findFirst({
    where: sql`lower(${user.email}) = ${normalizedEmail}`,
    columns: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Email/password sign-up. Better Auth emailOTP plugin sends the verification OTP; we redirect to verify-email.
 *
 * `requireCaptcha` is set by `POST /api/auth/sign-up-with-turnstile`, whose name
 * is a promise to the caller. The plain `/api/auth/sign-up` route also verifies
 * a token when one is supplied and the server has a Turnstile secret, so the SPA
 * can start sending one without a second route.
 */
export async function signUpDev(
  request: Request,
  opts: { requireCaptcha?: boolean } = {},
) {
  const ipRate = await enforceRateLimit(signUpIpLimiter, `sign_up:${clientIp(request)}`);
  if (!ipRate.allowed) {
    return RouteResponse.json(
      {
        error: ipRate.error,
        code: ipRate.status === 429 ? "RATE_LIMITED" : "SERVICE_UNAVAILABLE",
      },
      { status: ipRate.status },
    );
  }

  const body = await request.json().catch(() => ({}));
  const {
    name,
    email,
    password,
    acceptTerms,
    acceptPrivacy,
    marketingOptIn,
    turnstileToken,
  } = body as {
    name?: string;
    email?: string;
    password?: string;
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
    marketingOptIn?: boolean;
    turnstileToken?: string;
  };

  const captchaRequired =
    opts.requireCaptcha === true ||
    (isTurnstileConfigured() && typeof turnstileToken === "string");
  if (captchaRequired) {
    const captcha = await verifyTurnstileToken(
      turnstileToken,
      clientIp(request),
    );
    if (!captcha.ok) {
      return RouteResponse.json(
        { error: captcha.error, code: "turnstile_failed" },
        { status: captcha.status },
      );
    }
  }

  const consentError = validateSignupLegalConsent({ acceptTerms, acceptPrivacy });
  if (consentError) {
    return RouteResponse.json(
      { error: consentError, code: "LEGAL_CONSENT_REQUIRED" },
      { status: 400 },
    );
  }

  const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
  if (!name || !normalizedEmail || !password) {
    return RouteResponse.json(
      { error: "Missing name, email, or password" },
      { status: 400 },
    );
  }

  if (await findUserIdByNormalizedEmail(normalizedEmail)) {
    return emailAlreadyExistsResponse();
  }

  const h = await headers();
  try {
    const verifyEmailUrl = new URL("/auth/verify-email", env.NEXT_PUBLIC_APP_URL);
    verifyEmailUrl.searchParams.set("email", normalizedEmail);

    const response = await auth.api.signUpEmail({
      body: {
        name: String(name).trim(),
        email: normalizedEmail,
        password: String(password),
        callbackURL: verifyEmailUrl.toString(),
      },
      headers: h,
      asResponse: true,
    }) as Response;

    if (!response.ok) {
      const mapped = await mapSignUpErrorFromResponse(response);
      if (mapped.code !== "EMAIL_ALREADY_EXISTS") {
        const existingId = await findUserIdByNormalizedEmail(normalizedEmail);
        if (existingId) return emailAlreadyExistsResponse();
      }
      return RouteResponse.json(mapped, { status: response.status });
    }

    const signUpPayload = (await response.clone().json().catch(() => ({}))) as {
      user?: { id?: string };
    };
    const dbUserId = await findUserIdByNormalizedEmail(normalizedEmail);
    const responseUserId = signUpPayload.user?.id;
    // ponytail: Better Auth returns a synthetic user (fake id) for duplicate emails when email verification is required
    if (dbUserId && responseUserId && dbUserId !== responseUserId) {
      return emailAlreadyExistsResponse();
    }

    const created = dbUserId
      ? { id: dbUserId }
      : await db.query.user.findFirst({
          where: eq(user.email, normalizedEmail),
          columns: { id: true },
        });
    if (created) {
      await recordLegalAcceptances({
        userId: created.id,
        acceptTerms: true,
        acceptPrivacy: true,
        marketingOptIn: !!marketingOptIn,
        ipAddress: clientIp(request),
        userAgent: request.headers.get("user-agent"),
      });
    }

    // OTP is sent by Better Auth emailOTP plugin on sign-up (single send path); do not call sendVerificationOTP here to avoid duplicate emails.

    const verifyPath = `/auth/verify-email?email=${encodeURIComponent(normalizedEmail)}`;
    return RouteResponse.jsonWithCookies({ ok: true, url: verifyPath }, response);
  } catch (e) {
    if (await findUserIdByNormalizedEmail(normalizedEmail)) {
      return emailAlreadyExistsResponse();
    }
    const status =
      e && typeof (e as { status?: number }).status === "number"
        ? (e as { status: number }).status
        : 500;
    const mapped = mapSignUpError(e);
    return RouteResponse.json(mapped, { status });
  }
}

/** `POST /api/auth/sign-up-with-turnstile` — the captcha is never optional here. */
export function signUpWithTurnstile(request: Request) {
  return signUpDev(request, { requireCaptcha: true });
}

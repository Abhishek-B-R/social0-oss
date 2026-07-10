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
import { db } from "../../db/index.js";
import { user } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { verifyTurnstileIfConfigured } from "../../lib/turnstile.js";

/**
 * Email/password sign-up. Better Auth emailOTP plugin sends the verification OTP; we redirect to verify-email.
 */
export async function signUpDev(request: Request) {
  const ipRate = await enforceRateLimit(signUpIpLimiter, `sign_up:${clientIp(request)}`);
  if (!ipRate.allowed) {
    return RouteResponse.json({ error: ipRate.error }, { status: ipRate.status });
  }

  const body = await request.json().catch(() => ({}));
  const {
    name,
    email,
    password,
    turnstileToken,
    acceptTerms,
    acceptPrivacy,
    marketingOptIn,
  } = body as {
    name?: string;
    email?: string;
    password?: string;
    turnstileToken?: string;
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
    marketingOptIn?: boolean;
  };

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

  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, normalizedEmail),
    columns: { id: true },
  });
  if (existingUser) {
    return RouteResponse.json(
      { error: EMAIL_ALREADY_EXISTS_MESSAGE, code: "EMAIL_ALREADY_EXISTS" },
      { status: 409 },
    );
  }

  const turnstile = await verifyTurnstileIfConfigured(
    turnstileToken,
    env.TURNSTILE_SECRET_KEY,
  );
  if (!turnstile.ok) {
    return RouteResponse.json(
      {
        error: turnstile.error,
        code: turnstile.code,
        retry: turnstile.retry,
      },
      { status: turnstile.status },
    );
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
      return RouteResponse.json(mapped, { status: response.status });
    }

    const created = await db.query.user.findFirst({
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

    const redirectUrl = new URL("/auth/verify-email", env.NEXT_PUBLIC_APP_URL);
    redirectUrl.searchParams.set("email", normalizedEmail);
    const res = RouteResponse.redirect(redirectUrl);
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      res.headers.append("set-cookie", cookie);
    }
    return res;
  } catch (e) {
    const status =
      e && typeof (e as { status?: number }).status === "number"
        ? (e as { status: number }).status
        : 500;
    const mapped = mapSignUpError(e);
    return RouteResponse.json(mapped, { status });
  }
}

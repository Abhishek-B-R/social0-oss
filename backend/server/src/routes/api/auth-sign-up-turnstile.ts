import { auth } from "../../lib/auth.js";
import { env } from "../../lib/env.js";
import { mapSignUpError, mapSignUpErrorFromResponse } from "../../lib/sign-up-errors.js";
import { headers } from "../../lib/shim/next-headers.js";
import { NextResponse } from "../../lib/shim/next-server.js";
import { enforceRateLimit, signUpIpLimiter } from "../../lib/ratelimit.js";
import { clientIp } from "../../lib/client-ip.js";
import {
  recordLegalAcceptances,
  validateSignupLegalConsent,
} from "../../lib/legal.js";
import { db } from "../../db/index.js";
import { user } from "../../db/schema.js";
import { eq } from "drizzle-orm";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Sign-up with Cloudflare Turnstile verification.
 * Better Auth emailOTP plugin sends the verification OTP; we redirect to verify-email (email/password only).
 */
export async function POST(request: Request) {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Turnstile not configured" },
      { status: 503 },
    );
  }

  const ipRate = await enforceRateLimit(signUpIpLimiter, `sign_up:${clientIp(request)}`);
  if (!ipRate.allowed) {
    return NextResponse.json({ error: ipRate.error }, { status: ipRate.status });
  }

  const body = await request.json().catch(() => ({}));
  const { name, email, password, turnstileToken, acceptTerms, acceptPrivacy, marketingOptIn }
    = body as {
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
    return NextResponse.json(
      { error: consentError, code: "LEGAL_CONSENT_REQUIRED" },
      { status: 400 },
    );
  }

  const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
  if (!name || !normalizedEmail || !password || !turnstileToken) {
    return NextResponse.json(
      { error: "Missing name, email, password, or turnstile token" },
      { status: 400 },
    );
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", turnstileToken);

  const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body: formData,
  });
  const verifyData = (await verifyRes.json()) as {
    success?: boolean;
    "error-codes"?: string[];
  };

  if (!verifyData.success) {
    return NextResponse.json(
      {
        error: "Please complete the verification challenge and try again.",
        code: "turnstile_failed",
        retry: true,
      },
      { status: 422 },
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
      return NextResponse.json(mapped, { status: response.status });
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
    const res = NextResponse.redirect(redirectUrl);
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      res.headers.append("set-cookie", cookie);
    }
    return res;
  } catch (e) {
    const status = e && typeof (e as { status?: number }).status === "number"
      ? (e as { status: number }).status
      : 500;
    const mapped = mapSignUpError(e);
    return NextResponse.json(mapped, { status });
  }
}

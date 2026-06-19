import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  mapSignUpError,
  mapSignUpErrorFromResponse,
} from "@/lib/sign-up-errors";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { enforceRateLimit, signUpIpLimiter } from "@/lib/ratelimit";
import { clientIp } from "@/lib/client-ip";

/**
 * Email/password sign-up. Better Auth emailOTP plugin sends the verification OTP; we redirect to verify-email (no Turnstile).
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Sign-up requires verification. Use the sign-up form." },
      { status: 403 },
    );
  }

  const ipRate = await enforceRateLimit(signUpIpLimiter, `sign_up:${clientIp(request)}`);
  if (!ipRate.allowed) {
    return NextResponse.json({ error: ipRate.error }, { status: ipRate.status });
  }

  const body = await request.json().catch(() => ({}));
  const { name, email, password } = body as {
    name?: string;
    email?: string;
    password?: string;
  };

  const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
  if (!name || !normalizedEmail || !password) {
    return NextResponse.json(
      { error: "Missing name, email, or password" },
      { status: 400 },
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
    const status =
      e && typeof (e as { status?: number }).status === "number"
        ? (e as { status: number }).status
        : 500;
    const mapped = mapSignUpError(e);
    return NextResponse.json(mapped, { status });
  }
}

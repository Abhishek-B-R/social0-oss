import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Sign-up with Cloudflare Turnstile verification.
 * Better Auth emailOTP plugin sends the verification OTP; we redirect to verify-email (email/password only).
 */
export async function POST(request: Request) {
  const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Turnstile not configured" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { name, email, password, turnstileToken }
    = body as { name?: string; email?: string; password?: string; turnstileToken?: string };

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
  const verifyData = (await verifyRes.json()) as { success?: boolean };

  if (!verifyData.success) {
    return NextResponse.json(
      { error: "Bot detected" },
      { status: 403 },
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
      return NextResponse.json(
        { error: GENERIC_AUTH_ERROR },
        { status: response.status },
      );
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
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status });
  }
}

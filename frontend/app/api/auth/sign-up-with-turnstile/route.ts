import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Sign-up with Cloudflare Turnstile verification.
 * After signup, send OTP and redirect to verify-email (email/password only).
 */
export async function POST(request: Request) {
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
      const clone = response.clone();
      try {
        const body = await clone.json().catch(() => ({}));
        return NextResponse.json(body, { status: response.status });
      } catch {
        return response;
      }
    }

    try {
      await auth.api.sendVerificationOTP({
        body: { email: normalizedEmail, type: "email-verification" },
        headers: h,
      });
    } catch (otpError) {
      const code = otpError && typeof (otpError as { code?: string }).code === "string"
        ? (otpError as { code: string }).code
        : "";
      const benignCodes = ["USER_ALREADY_EXISTS", "EMAIL_ALREADY_VERIFIED"];
      if (!benignCodes.includes(code)) {
        throw otpError;
      }
      // Account already created; redirect so user can use Resend on verify-email page
    }

    const redirectUrl = new URL("/auth/verify-email", request.url);
    redirectUrl.searchParams.set("email", normalizedEmail);
    const res = NextResponse.redirect(redirectUrl);
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      res.headers.append("set-cookie", cookie);
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sign up failed";
    const status = e && typeof (e as { status?: number }).status === "number"
      ? (e as { status: number }).status
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

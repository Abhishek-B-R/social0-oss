import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Email/password sign-up. Better Auth emailOTP plugin sends the verification OTP; we redirect to verify-email (no Turnstile).
 */
export async function POST(request: Request) {
  const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";
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
    const status =
      e && typeof (e as { status?: number }).status === "number"
        ? (e as { status: number }).status
        : 500;
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status });
  }
}

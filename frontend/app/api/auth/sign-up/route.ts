import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Email/password sign-up. Sends OTP and redirects to verify-email (no Turnstile).
 */
export async function POST(request: Request) {
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
      const clone = response.clone();
      try {
        const body = await clone.json().catch(() => ({}));
        return NextResponse.json(body, { status: response.status });
      } catch {
        return response;
      }
    }

    await auth.api.sendVerificationOTP({
      body: { email: normalizedEmail, type: "email-verification" },
      headers: h,
    });

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
    const status =
      e && typeof (e as { status?: number }).status === "number"
        ? (e as { status: number }).status
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

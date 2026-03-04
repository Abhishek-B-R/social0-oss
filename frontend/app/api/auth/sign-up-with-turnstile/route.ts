import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Sign-up with Cloudflare Turnstile verification.
 * Use this instead of the default sign-up when Turnstile is configured.
 */
export async function POST(request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Turnstile not configured" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { name, email, password, turnstileToken }
    = body as { name?: string; email?: string; password?: string; turnstileToken?: string };

  if (!name || !email || !password || !turnstileToken) {
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

  try {
    const response = await auth.api.signUpEmail({
      body: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        password: String(password),
        callbackURL: "/dashboard/composer",
      },
      headers: await headers(),
      asResponse: true,
    });

    return response as Response;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sign up failed";
    const status = e && typeof (e as { status?: number }).status === "number"
      ? (e as { status: number }).status
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

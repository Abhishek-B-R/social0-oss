import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { checkEmailLimiter } from "@/lib/ratelimit";

/**
 * Check if an email is registered. Used on sign-in to show "No account found — sign up first" when appropriate.
 * Rate-limited to reduce enumeration.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  if (checkEmailLimiter) {
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anonymous";
    const { success } = await checkEmailLimiter.limit(`check_email:${ip}`);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1);

  return NextResponse.json({ exists: !!row?.id });
}

import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  checkEmailLimiter,
  checkEmailPerEmailLimiter,
  enforceRateLimit,
} from "@/lib/ratelimit";

/**
 * Check if an email is registered. Used on sign-in to show "No account found - sign up first" when appropriate.
 * Rate-limited to reduce enumeration.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  const normalized =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";

  const ipRate = await enforceRateLimit(checkEmailLimiter, `check_email:${ip}`);
  if (!ipRate.allowed) {
    return NextResponse.json(
      { error: ipRate.error },
      { status: ipRate.status },
    );
  }

  const emailRate = await enforceRateLimit(
    checkEmailPerEmailLimiter,
    `check_email_addr:${normalized}`,
  );
  if (!emailRate.allowed) {
    return NextResponse.json(
      { error: emailRate.error },
      { status: emailRate.status },
    );
  }

  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1);

  return NextResponse.json({ exists: !!row?.id });
}

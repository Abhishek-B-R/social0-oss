import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user, verification } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Verify OTP sent to new email and update the current user's email.
 * OTP was sent via POST /api/auth/email-otp/send-verification-otp with type "email-verification".
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { newEmail, otp } = body as { newEmail?: string; otp?: string };
  const email = newEmail ? String(newEmail).trim().toLowerCase() : "";
  const otpTrimmed = otp ? String(otp).trim() : "";

  if (!email || !otpTrimmed) {
    return NextResponse.json(
      { error: "Missing newEmail or otp" },
      { status: 400 },
    );
  }

  const identifier = `change-email-otp-${email}`;
  const [row] = await db
    .select()
    .from(verification)
    .where(
      and(
        eq(verification.identifier, identifier),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: "Invalid or expired code." },
      { status: 400 },
    );
  }

  const [storedOtp] = row.value.split(":");
  if (
    storedOtp.length !== otpTrimmed.length ||
    !timingSafeEqual(Buffer.from(storedOtp, "utf8"), Buffer.from(otpTrimmed, "utf8"))
  ) {
    return NextResponse.json(
      { error: "Invalid or expired code." },
      { status: 400 },
    );
  }

  await db
    .update(user)
    .set({ email, emailVerified: true })
    .where(eq(user.id, session.user.id));

  await db.delete(verification).where(eq(verification.id, row.id));

  return NextResponse.json({ success: true });
}

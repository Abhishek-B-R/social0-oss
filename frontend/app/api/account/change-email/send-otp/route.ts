import { auth } from "@/lib/auth";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { sendEmail } from "@/lib/mail";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID, randomInt } from "crypto";
import { eq } from "drizzle-orm";

const OTP_LENGTH = 6;
const OTP_EXPIRES_SEC = 600;

function generateOTP(): string {
  const n = randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, "0");
}

/**
 * Send OTP to new email for change-email flow.
 * Requires session. Stores OTP under identifier "change-email-otp-{newEmail}".
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const newEmail = body.newEmail ? String(body.newEmail).trim().toLowerCase() : "";
  if (!newEmail) {
    return NextResponse.json({ error: "Missing newEmail" }, { status: 400 });
  }

  if (newEmail === session.user.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "New email is the same as current email." },
      { status: 400 },
    );
  }

  const otp = generateOTP();
  const identifier = `change-email-otp-${newEmail}`;
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_SEC * 1000);

  await db
    .delete(verification)
    .where(eq(verification.identifier, identifier));

  await db.insert(verification).values({
    id: randomUUID(),
    identifier,
    value: `${otp}:0`,
    expiresAt,
  });

  await sendEmail({
    to: newEmail,
    subject: "Verify your new Social0 email",
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
        <h2>Your verification code</h2>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#10b981">${otp}</p>
        <p>This code expires in 10 minutes. Do not share it with anyone.</p>
      </div>
    `,
  });

  return NextResponse.json({ success: true });
}

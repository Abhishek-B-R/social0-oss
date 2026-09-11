import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { verification } from "../../db/schema.js";
import { sendEmail } from "../../lib/mail.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import { randomUUID, randomInt } from "crypto";
import { eq } from "drizzle-orm";
import {
  changeEmailOtpIpLimiter,
  changeEmailOtpLimiter,
  changeEmailOtpTargetLimiter,
  enforceRateLimit,
} from "../../lib/ratelimit.js";
import { clientIp } from "../../lib/client-ip.js";

const OTP_LENGTH = 6;
const OTP_EXPIRES_SEC = 600;
const MAX_EMAIL_LENGTH = 254;
/** Deliberately loose: one @, no whitespace, a dot in the domain. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function isPlausibleEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(value);
}

function generateOTP(): string {
  const n = randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, "0");
}

/**
 * Send OTP to new email for change-email flow.
 * Requires session. Stores OTP under identifier "change-email-otp-{newEmail}".
 */
export async function sendChangeEmailOtp(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(request);

  const userRate = await enforceRateLimit(
    changeEmailOtpLimiter,
    session.user.id,
  );
  if (!userRate.allowed) {
    return RouteResponse.json(
      { error: userRate.error },
      { status: userRate.status },
    );
  }

  const ipRate = await enforceRateLimit(changeEmailOtpIpLimiter, ip);
  if (!ipRate.allowed) {
    return RouteResponse.json(
      { error: ipRate.error },
      { status: ipRate.status },
    );
  }

  const body = await request.json().catch(() => ({}));
  const newEmail = body.newEmail
    ? String(body.newEmail).trim().toLowerCase()
    : "";
  if (!newEmail) {
    return RouteResponse.json({ error: "Missing newEmail" }, { status: 400 });
  }
  // Validate before the send: an unusable address still burns the per-target
  // budget and leaves a pending OTP row behind.
  if (!isPlausibleEmail(newEmail)) {
    return RouteResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const targetRate = await enforceRateLimit(
    changeEmailOtpTargetLimiter,
    newEmail,
  );
  if (!targetRate.allowed) {
    return RouteResponse.json(
      { error: targetRate.error },
      { status: targetRate.status },
    );
  }

  if (newEmail === session.user.email?.toLowerCase()) {
    return RouteResponse.json(
      { error: "New email is the same as current email." },
      { status: 400 },
    );
  }

  const otp = generateOTP();
  const identifier = `change-email-otp-${newEmail}`;
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_SEC * 1000);

  await db.delete(verification).where(eq(verification.identifier, identifier));

  await db.insert(verification).values({
    id: randomUUID(),
    identifier,
    value: `${otp}:0:${session.user.id}`,
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

  return RouteResponse.json({ success: true });
}

import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { user, account, verification } from "../../db/schema.js";
import { eq, and, gt, ne } from "drizzle-orm";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import { enforceRateLimit, slidingWindowLimiter } from "../../lib/ratelimit.js";
import { clientIp } from "../../lib/client-ip.js";
import { sendEmail } from "../../lib/mail.js";
import { timingSafeEqual } from "crypto";

const MAX_OTP_ATTEMPTS = 5;

// Verify attempts, on top of the per-code cap: a user can request 5 codes an
// hour (send-otp limiter), so 20 guesses per user and 30 per IP leave room for
// typos and nothing for brute force.
const changeEmailVerifyLimiter = slidingWindowLimiter(20, "1 h", "rl:change_email_verify_user");

const changeEmailVerifyIpLimiter = slidingWindowLimiter(30, "1 h", "rl:change_email_verify_ip");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Tell the old address its account moved, so a hijacked session cannot do it silently. */
async function notifyPreviousEmail(previousEmail: string, newEmail: string) {
  try {
    await sendEmail({
      to: previousEmail,
      subject: "Your Social0 email address was changed",
      html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
        <h2>Your email address was changed</h2>
        <p>The email on your Social0 account is now <strong>${escapeHtml(newEmail)}</strong>.</p>
        <p>If you did not make this change, contact support right away.</p>
      </div>
    `,
    });
  } catch (err) {
    console.error("[change-email] Failed to notify previous email:", err);
  }
}

/**
 * Verify OTP sent to new email and update the current user's email.
 * OTP was sent via send-otp; value format is "otp:attempts".
 */
export async function changeEmail(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRate = await enforceRateLimit(
    changeEmailVerifyLimiter,
    session.user.id,
  );
  if (!userRate.allowed) {
    return RouteResponse.json(
      { error: userRate.error },
      { status: userRate.status },
    );
  }
  const ipRate = await enforceRateLimit(
    changeEmailVerifyIpLimiter,
    clientIp(request),
  );
  if (!ipRate.allowed) {
    return RouteResponse.json(
      { error: ipRate.error },
      { status: ipRate.status },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { newEmail, otp } = body as { newEmail?: string; otp?: string };
  const email = newEmail ? String(newEmail).trim().toLowerCase() : "";
  const otpTrimmed = otp ? String(otp).trim() : "";

  if (!email || !otpTrimmed) {
    return RouteResponse.json(
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
    return RouteResponse.json(
      { error: "Invalid or expired code." },
      { status: 400 },
    );
  }

  const parts = row.value.split(":");
  const storedOtp = parts[0] ?? "";
  const parsedAttempts = Number.parseInt(parts[1] ?? "0", 10);
  // A malformed counter must not read as NaN: `NaN + 1 >= MAX` is false, which
  // would leave the code open to unlimited guesses.
  const attempts = Number.isFinite(parsedAttempts)
    ? Math.min(MAX_OTP_ATTEMPTS + 1, Math.max(0, parsedAttempts))
    : MAX_OTP_ATTEMPTS;
  const otpUserId = parts[2] ?? "";

  if (!otpUserId || otpUserId !== session.user.id) {
    return RouteResponse.json(
      { error: "Invalid or expired code." },
      { status: 400 },
    );
  }

  const tooManyAttempts = () =>
    RouteResponse.json(
      { error: "Too many failed attempts. Request a new code." },
      { status: 400 },
    );

  if (attempts >= MAX_OTP_ATTEMPTS) {
    await db.delete(verification).where(eq(verification.id, row.id));
    return tooManyAttempts();
  }

  // Spend the attempt before comparing, as a compare-and-set on the value we
  // read. A burst of concurrent guesses all read the same counter; only one
  // of them can move it, and the rest are rejected without being compared.
  // Otherwise the whole burst costs a single attempt.
  const newAttempts = attempts + 1;
  const [spent] = await db
    .update(verification)
    .set({ value: `${storedOtp}:${newAttempts}:${otpUserId}` })
    .where(and(eq(verification.id, row.id), eq(verification.value, row.value)))
    .returning({ id: verification.id });
  if (!spent) {
    return RouteResponse.json(
      { error: "Invalid or expired code." },
      { status: 400 },
    );
  }

  if (
    storedOtp.length !== otpTrimmed.length ||
    !timingSafeEqual(Buffer.from(storedOtp, "utf8"), Buffer.from(otpTrimmed, "utf8"))
  ) {
    if (newAttempts >= MAX_OTP_ATTEMPTS) {
      await db.delete(verification).where(eq(verification.id, row.id));
      return tooManyAttempts();
    }
    return RouteResponse.json(
      { error: "Invalid or expired code." },
      { status: 400 },
    );
  }

  const emailInUseResponse = () =>
    RouteResponse.json(
      { error: "This email is already in use by another account." },
      { status: 409 },
    );

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.email, email), ne(user.id, session.user.id)))
        .limit(1);

      if (existing) {
        throw { code: "EMAIL_IN_USE" as const };
      }

      await tx
        .update(user)
        .set({ email, emailVerified: true, updatedAt: new Date() })
        .where(eq(user.id, session.user.id));

      await tx
        .update(account)
        .set({ accountId: email, updatedAt: new Date() })
        .where(
          and(
            eq(account.userId, session.user.id),
            eq(account.providerId, "credential"),
          ),
        );

      await tx.delete(verification).where(eq(verification.id, row.id));
    });
  } catch (err) {
    if (err && typeof err === "object" && (err as { code?: string }).code === "EMAIL_IN_USE") {
      return emailInUseResponse();
    }
    const pgCode =
      err && typeof err === "object" ? (err as { code?: string }).code : undefined;
    if (pgCode === "23505") {
      return emailInUseResponse();
    }
    console.error("[change-email] Failed to update email:", err);
    return RouteResponse.json(
      { error: "Could not update email. Please try again." },
      { status: 500 },
    );
  }

  const previousEmail = session.user.email?.trim().toLowerCase() ?? "";
  if (previousEmail && previousEmail !== email) {
    await notifyPreviousEmail(previousEmail, email);
  }

  const sessionHeaders = await headers();
  await auth.api.getSession({
    headers: sessionHeaders,
    query: { disableCookieCache: true },
  });

  return RouteResponse.json({ success: true, email });
}

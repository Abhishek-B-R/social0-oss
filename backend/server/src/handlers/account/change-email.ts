import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { user, account, verification } from "../../db/schema.js";
import { eq, and, gt, ne } from "drizzle-orm";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import { timingSafeEqual } from "crypto";

const MAX_OTP_ATTEMPTS = 5;

/**
 * Verify OTP sent to new email and update the current user's email.
 * OTP was sent via send-otp; value format is "otp:attempts".
 */
export async function changeEmail(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  if (
    storedOtp.length !== otpTrimmed.length ||
    !timingSafeEqual(Buffer.from(storedOtp, "utf8"), Buffer.from(otpTrimmed, "utf8"))
  ) {
    const newAttempts = attempts + 1;
    if (newAttempts >= MAX_OTP_ATTEMPTS) {
      await db.delete(verification).where(eq(verification.id, row.id));
      return RouteResponse.json(
        { error: "Too many failed attempts. Request a new code." },
        { status: 400 },
      );
    }
    await db
      .update(verification)
      .set({ value: `${storedOtp}:${newAttempts}:${session.user.id}` })
      .where(eq(verification.id, row.id));
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

  const sessionHeaders = await headers();
  await auth.api.getSession({
    headers: sessionHeaders,
    query: { disableCookieCache: true },
  });

  return RouteResponse.json({ success: true, email });
}

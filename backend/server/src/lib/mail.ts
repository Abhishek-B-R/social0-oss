import { Resend } from "resend";
import { env } from "./env.js";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /**
   * Resend dedupes sends that share this key for 24h, so a retry after a
   * timeout (the first request may have gone through) does not mail twice.
   */
  idempotencyKey?: string;
};

/**
 * Resend rejected or failed the send. `statusCode` / `code` come from Resend's
 * error body (e.g. 429 / `rate_limit_exceeded`) so callers can tell a
 * throttle from a permanent failure; `retryAfterSec` is the `retry-after`
 * header when Resend sent one.
 */
export class SendEmailError extends Error {
  readonly statusCode: number | null;
  readonly code: string | null;
  readonly retryAfterSec: number | null;

  constructor(
    message: string,
    details: {
      statusCode?: number | null;
      code?: string | null;
      retryAfterSec?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "SendEmailError";
    this.statusCode = details.statusCode ?? null;
    this.code = details.code ?? null;
    this.retryAfterSec = details.retryAfterSec ?? null;
  }
}

function parseRetryAfterSec(
  headers: Record<string, string> | null | undefined,
): number | null {
  const raw = headers?.["retry-after"];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

type SendEmailResult = {
  id?: string;
};

/**
 * Send transactional email via Resend.
 * Throws on API/transport failure so callers can retry (do not treat as success).
 */
export async function sendEmail({
  to,
  subject,
  html,
  idempotencyKey,
}: SendEmailInput): Promise<SendEmailResult> {
  // Lazy client so CF Workers bootstrap can inject RESEND_* before first send.
  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send(
    {
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  if (result.error) {
    const msg =
      typeof result.error === "object" &&
      result.error &&
      "message" in result.error &&
      typeof (result.error as { message?: unknown }).message === "string"
        ? (result.error as { message: string }).message
        : "Resend email send failed";
    const err = result.error as { statusCode?: unknown; name?: unknown };
    throw new SendEmailError(msg, {
      statusCode: typeof err.statusCode === "number" ? err.statusCode : null,
      code: typeof err.name === "string" ? err.name : null,
      retryAfterSec: parseRetryAfterSec(result.headers),
    });
  }

  const id =
    result.data &&
    typeof result.data === "object" &&
    "id" in result.data &&
    typeof (result.data as { id?: unknown }).id === "string"
      ? (result.data as { id: string }).id
      : undefined;

  return { id };
}

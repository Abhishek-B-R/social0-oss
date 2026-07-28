import { Resend } from "resend";
import { env } from "./env.js";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

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
}: SendEmailInput): Promise<SendEmailResult> {
  // Lazy client so CF Workers bootstrap can inject RESEND_* before first send.
  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (result.error) {
    const msg =
      typeof result.error === "object" &&
      result.error &&
      "message" in result.error &&
      typeof (result.error as { message?: unknown }).message === "string"
        ? (result.error as { message: string }).message
        : "Resend email send failed";
    throw new Error(msg);
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

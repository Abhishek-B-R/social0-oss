import {
  SOCIAL0_WEBHOOK_EVENT_HEADER,
  SOCIAL0_WEBHOOK_SIGNATURE_HEADER,
  verifySocial0WebhookSignature,
} from "@social0/shared";
import type { WebhookPayload } from "./user-webhook-delivery.js";

export { SOCIAL0_WEBHOOK_SIGNATURE_HEADER, SOCIAL0_WEBHOOK_EVENT_HEADER };

export type VerifyUserWebhookResult =
  | { ok: true; payload: WebhookPayload }
  | { ok: false; error: string };

/**
 * Verify an inbound Social0 webhook on your server.
 * Pass the raw JSON body string (before parsing) and the signature header.
 */
export async function verifyIncomingSocial0Webhook(
  rawBody: string,
  secret: string,
  signatureHeader: string | null | undefined,
): Promise<VerifyUserWebhookResult> {
  const valid = await verifySocial0WebhookSignature(
    rawBody,
    secret,
    signatureHeader,
  );
  if (!valid) {
    return { ok: false, error: "Invalid or expired webhook signature" };
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }

  if (!payload?.id || !payload?.type || !payload?.created_at) {
    return { ok: false, error: "Malformed webhook payload" };
  }

  return { ok: true, payload };
}

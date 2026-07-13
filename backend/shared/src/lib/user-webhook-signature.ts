export const SOCIAL0_WEBHOOK_SIGNATURE_HEADER = "X-Social0-Signature";
export const SOCIAL0_WEBHOOK_EVENT_HEADER = "X-Social0-Event";
export const SOCIAL0_WEBHOOK_DELIVERY_ID_HEADER = "X-Social0-Delivery-Id";
/** Reject signed requests older/newer than this (seconds). */
export const SOCIAL0_WEBHOOK_MAX_SKEW_SEC = 300;

export function buildSocial0WebhookSignaturePayload(
  timestampSec: number,
  body: string,
): string {
  return `${timestampSec}.${body}`;
}

export function formatSocial0WebhookSignatureHeader(
  timestampSec: number,
  signatureHex: string,
): string {
  return `t=${timestampSec},v1=${signatureHex}`;
}

export function parseSocial0WebhookSignatureHeader(
  header: string | null | undefined,
): { timestamp: number; signature: string } | null {
  if (!header?.trim()) return null;
  const tMatch = /(?:^|,)\s*t=(\d+)/.exec(header);
  const vMatch = /(?:^|,)\s*v1=([a-f0-9]+)/i.exec(header);
  if (!tMatch?.[1] || !vMatch?.[1]) return null;
  const timestamp = Number.parseInt(tMatch[1], 10);
  if (!Number.isFinite(timestamp)) return null;
  return { timestamp, signature: vMatch[1].toLowerCase() };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export async function signSocial0WebhookPayload(
  secret: string,
  timestampSec: number,
  body: string,
): Promise<string> {
  return hmacSha256Hex(
    secret,
    buildSocial0WebhookSignaturePayload(timestampSec, body),
  );
}

/** Verify an inbound Social0 webhook (use raw request body bytes as string). */
export async function verifySocial0WebhookSignature(
  body: string,
  secret: string,
  signatureHeader: string | null | undefined,
  maxSkewSec = SOCIAL0_WEBHOOK_MAX_SKEW_SEC,
): Promise<boolean> {
  const parsed = parseSocial0WebhookSignatureHeader(signatureHeader);
  if (!parsed || !secret) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > maxSkewSec) return false;

  const expected = await signSocial0WebhookPayload(
    secret,
    parsed.timestamp,
    body,
  );
  return timingSafeEqualHex(expected, parsed.signature);
}

/** ponytail: run once — node --import tsx backend/shared/src/lib/user-webhook-signature.self-check.ts */
export async function assertSocial0WebhookSignatureRoundTrip(): Promise<void> {
  const secret = "test_webhook_secret";
  const body = JSON.stringify({
    id: "delivery-1",
    type: "post.published",
    created_at: "2026-07-12T00:00:00.000Z",
    data: { post_id: "post-1", status: "published" },
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await signSocial0WebhookPayload(secret, ts, body);
  const header = formatSocial0WebhookSignatureHeader(ts, sig);

  if (!(await verifySocial0WebhookSignature(body, secret, header))) {
    throw new Error("verifySocial0WebhookSignature failed round-trip");
  }
  if (await verifySocial0WebhookSignature(body, secret, "t=1,v1=deadbeef")) {
    throw new Error("verifySocial0WebhookSignature should reject bad signature");
  }
}

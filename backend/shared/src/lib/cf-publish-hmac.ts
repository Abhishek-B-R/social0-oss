export const CF_PUBLISH_TIMESTAMP_HEADER = "X-Publish-Timestamp";
export const CF_PUBLISH_SIGNATURE_HEADER = "X-Publish-Signature";
/** Reject signed requests older/newer than this (seconds). */
export const CF_PUBLISH_MAX_SKEW_SEC = 300;

export function buildPublishSignaturePayload(
  timestampSec: number,
  body: string,
): string {
  return `${timestampSec}.${body}`;
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

export async function signPublishRequestBody(
  body: string,
  secret: string,
  timestampSec = Math.floor(Date.now() / 1000),
): Promise<{ timestamp: string; signature: string }> {
  const payload = buildPublishSignaturePayload(timestampSec, body);
  const signature = await hmacSha256Hex(secret, payload);
  return { timestamp: String(timestampSec), signature };
}

export async function verifyPublishRequestBody(
  body: string,
  secret: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  maxSkewSec = CF_PUBLISH_MAX_SKEW_SEC,
): Promise<boolean> {
  if (!timestampHeader || !signatureHeader || !secret) return false;
  const ts = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > maxSkewSec) return false;
  const expected = await hmacSha256Hex(
    secret,
    buildPublishSignaturePayload(ts, body),
  );
  return timingSafeEqualHex(expected, signatureHeader.trim());
}

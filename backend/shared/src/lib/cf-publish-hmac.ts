import {
  buildTimestampedSignaturePayload,
  hmacSha256Hex,
  timingSafeEqualHex,
} from "./hmac.js";

export const CF_PUBLISH_TIMESTAMP_HEADER = "X-Publish-Timestamp";
export const CF_PUBLISH_SIGNATURE_HEADER = "X-Publish-Signature";
/** Reject signed requests older/newer than this (seconds). */
export const CF_PUBLISH_MAX_SKEW_SEC = 300;

export function buildPublishSignaturePayload(
  timestampSec: number,
  body: string,
): string {
  return buildTimestampedSignaturePayload(timestampSec, body);
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

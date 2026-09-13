/**
 * HMAC-SHA256 primitives for the two signing schemes in this repo: the API →
 * publish-worker dispatch signature and outbound user webhooks. Both had their
 * own copy, which for a constant-time comparison is one copy too many — a fix
 * to either would have silently left the other unfixed.
 *
 * WebCrypto rather than `node:crypto` so the publish worker can import this on
 * Cloudflare Workers.
 */

export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
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

/**
 * Compare two hex digests without leaking where they first differ.
 *
 * Length is compared up front: both sides are fixed-width SHA-256 digests, so a
 * length mismatch is a malformed header, not a near-miss guess.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

/** `<unix seconds>.<raw body>` — the signed payload both schemes use. */
export function buildTimestampedSignaturePayload(
  timestampSec: number,
  body: string,
): string {
  return `${timestampSec}.${body}`;
}

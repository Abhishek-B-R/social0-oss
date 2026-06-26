import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { env } from "./env.js";

const KEY_PREFIX = "s0_live_";

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const raw = `${KEY_PREFIX}${secret}`;
  const hash = hashApiKey(raw);
  return { raw, hash, prefix: raw.slice(0, 12) };
}

/** HMAC-SHA256 with server secret (pepper). */
export function hashApiKey(raw: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(raw).digest("hex");
}

/** Legacy SHA-256 hashes (pre-pepper); verified for migration only. */
function legacyHashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function lookupApiKeyRow(hash: string) {
  const rows = await db
    .select({
      userId: apiKeys.userId,
      expiresAt: apiKeys.expiresAt,
      id: apiKeys.id,
      keyHash: apiKeys.keyHash,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveUserIdFromApiKey(
  authorization: string | undefined,
): Promise<string | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const raw = authorization.slice("Bearer ".length).trim();
  if (!raw.startsWith(KEY_PREFIX)) return null;

  const pepperedHash = hashApiKey(raw);
  let row = await lookupApiKeyRow(pepperedHash);

  if (!row) {
    const legacyHash = legacyHashApiKey(raw);
    row = await lookupApiKeyRow(legacyHash);
    if (row) {
      await db
        .update(apiKeys)
        .set({ keyHash: pepperedHash })
        .where(eq(apiKeys.id, row.id));
    }
  }

  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));

  return row.userId;
}

export function safeCompareApiKey(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

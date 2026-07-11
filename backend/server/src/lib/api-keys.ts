import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { env } from "./env.js";

export const KEY_PREFIX = "sk_live_";
const LEGACY_PREFIX = "s0_live_";

export type ApiKeyAuth = {
  userId: string;
  apiKeyId: string;
};

export function isApiKeyFormat(raw: string): boolean {
  return raw.startsWith(KEY_PREFIX) || raw.startsWith(LEGACY_PREFIX);
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const raw = `${KEY_PREFIX}${secret}`;
  const hash = hashApiKey(raw);
  return { raw, hash, prefix: raw.slice(0, 16) };
}

/** SHA-256 with server secret pepper (HMAC-SHA256). */
export function hashApiKey(raw: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(raw).digest("hex");
}

/** Legacy plain SHA-256 hashes (pre-pepper); verified for migration only. */
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
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);
  return rows[0] ?? null;
}

function touchLastUsed(apiKeyId: string): void {
  // ponytail: fire-and-forget; last_used_at is best-effort telemetry
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKeyId))
    .catch(() => {});
}

export async function resolveApiKeyAuth(
  authorization: string | undefined,
): Promise<ApiKeyAuth | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const raw = authorization.slice("Bearer ".length).trim();
  if (!isApiKeyFormat(raw)) return null;

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

  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  touchLastUsed(row.id);
  return { userId: row.userId, apiKeyId: row.id };
}

/** @deprecated Use resolveApiKeyAuth */
export async function resolveUserIdFromApiKey(
  authorization: string | undefined,
): Promise<string | null> {
  const auth = await resolveApiKeyAuth(authorization);
  return auth?.userId ?? null;
}

export function safeCompareApiKey(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

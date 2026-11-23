import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { env } from "./env.js";
import { TtlCache } from "./ttl-cache.js";

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

/**
 * Live keys recently resolved on this process, by peppered hash and by row id.
 * Every /v1 request used to read its key row; this answers repeats without
 * Postgres. Only live keys are cached (a miss always reads the row), and every
 * write that revokes or deletes a key calls `forgetApiKeysForUser`, so a
 * revoke takes effect at once; the TTL bounds anything that bypasses it.
 */
export const API_KEY_CACHE_TTL_MS = 30_000;
type CachedKey = { userId: string; apiKeyId: string; expiresAt: number | null };
const keyCache = new TtlCache<string, CachedKey>(API_KEY_CACHE_TTL_MS, 10_000);

function cacheKey(row: { id: string; userId: string; expiresAt: Date | null }, hash?: string) {
  const value: CachedKey = {
    userId: row.userId,
    apiKeyId: row.id,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
  };
  keyCache.set(`id:${row.id}`, value);
  if (hash) keyCache.set(`hash:${hash}`, value);
}

function cachedKey(key: string): ApiKeyAuth | null {
  const hit = keyCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt !== null && hit.expiresAt < Date.now()) {
    keyCache.delete(key);
    return null;
  }
  touchLastUsed(hit.apiKeyId);
  return { userId: hit.userId, apiKeyId: hit.apiKeyId };
}

/** Call after revoking, deleting or rotating any of a user's keys. */
export function forgetApiKeysForUser(userId: string): void {
  keyCache.deleteWhere((value) => value.userId === userId);
}

/** At most one `last_used_at` write per key per this long. */
export const LAST_USED_WRITE_INTERVAL_MS = 60_000;
const lastUsedWrites = new TtlCache<string, true>(LAST_USED_WRITE_INTERVAL_MS, 10_000);

function touchLastUsed(apiKeyId: string): void {
  if (lastUsedWrites.get(apiKeyId)) return;
  lastUsedWrites.set(apiKeyId, true);
  // ponytail: fire-and-forget; last_used_at is best-effort telemetry
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKeyId))
    .catch(() => {});
}

/** Resolve a raw API key (peppered hash, with legacy SHA-256 migrate-on-read). */
export async function resolveRawApiKey(raw: string): Promise<ApiKeyAuth | null> {
  if (!isApiKeyFormat(raw)) return null;

  const pepperedHash = hashApiKey(raw);
  const cached = cachedKey(`hash:${pepperedHash}`);
  if (cached) return cached;
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

  cacheKey(row, pepperedHash);
  touchLastUsed(row.id);
  return { userId: row.userId, apiKeyId: row.id };
}

/**
 * Resolve a key by its row id: the MCP OAuth tokens point at their connector
 * key this way, so neither Redis nor the token records ever hold a raw key.
 * Same liveness rules as `resolveRawApiKey`.
 */
export async function resolveApiKeyById(apiKeyId: string): Promise<ApiKeyAuth | null> {
  const cached = cachedKey(`id:${apiKeyId}`);
  if (cached) return cached;
  const rows = await db
    .select({
      userId: apiKeys.userId,
      expiresAt: apiKeys.expiresAt,
      id: apiKeys.id,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.id, apiKeyId))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  cacheKey(row);
  touchLastUsed(row.id);
  return { userId: row.userId, apiKeyId: row.id };
}

export async function resolveApiKeyAuth(
  authorization: string | undefined,
): Promise<ApiKeyAuth | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const raw = authorization.slice("Bearer ".length).trim();
  return resolveRawApiKey(raw);
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

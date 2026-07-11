import { redis } from "./redis.js";

const IDEMPOTENCY_TTL_SEC = 86400;

export type IdempotencyRecord = {
  statusCode: number;
  body: string;
};

/** Returns cached response for duplicate idempotency key, or null if first request. */
export async function getIdempotencyResponse(
  userId: string,
  idempotencyKey: string,
): Promise<IdempotencyRecord | null> {
  if (!redis) return null;
  const key = `api:idemp:${userId}:${idempotencyKey}`;
  const raw = await redis.get<string>(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IdempotencyRecord;
  } catch {
    return null;
  }
}

export async function storeIdempotencyResponse(
  userId: string,
  idempotencyKey: string,
  statusCode: number,
  body: unknown,
): Promise<void> {
  if (!redis) return;
  const key = `api:idemp:${userId}:${idempotencyKey}`;
  const record: IdempotencyRecord = {
    statusCode,
    body: JSON.stringify(body),
  };
  await redis.set(key, JSON.stringify(record), { ex: IDEMPOTENCY_TTL_SEC });
}

/** Claim idempotency slot for in-flight request (prevents double publish). */
export async function claimIdempotencySlot(
  userId: string,
  idempotencyKey: string,
): Promise<boolean> {
  if (!redis) return true;
  const lockKey = `api:idemp:lock:${userId}:${idempotencyKey}`;
  const wasSet = await redis.set(lockKey, "1", { nx: true, ex: 300 });
  return wasSet !== null;
}

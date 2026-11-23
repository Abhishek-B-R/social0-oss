import { createHash } from "node:crypto";
import { apiError } from "./api-errors.js";
import { redis } from "./redis.js";

const IDEMPOTENCY_TTL_SEC = 86400;
/** In-flight lock. Released as soon as the response is stored (or the handler fails). */
const IDEMPOTENCY_LOCK_TTL_SEC = 300;

export type IdempotencyRecord = {
  statusCode: number;
  /** JSON-encoded response body. */
  body: string;
  location?: string;
  /**
   * `requestFingerprint` of the request that produced this response. Absent on
   * records written before fingerprints existed; those still replay.
   */
  fingerprint?: string;
};

export type IdempotentResult = {
  status: number;
  body: unknown;
  location?: string;
};

/**
 * Where a key applies. Records are keyed by user + scope + client key, so a key
 * reused on a different endpoint (or a different post) can never replay
 * another request's response.
 */
export type IdempotencyTarget = {
  userId: string;
  idempotencyKey: string;
  /** Method + concrete path, e.g. `POST /v1/posts/<id>/publish`. */
  scope: string;
  /** `requestFingerprint` of this request's body. */
  fingerprint: string;
};

/** JSON with object keys sorted at every depth, so key order never matters. */
function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * SHA-256 of the request body in canonical JSON. A key replays its stored
 * response only for the same body: reusing a key for a different request is a
 * client bug, and replaying the first response would report a post that was
 * never created (Stripe answers this with an error too).
 */
export function requestFingerprint(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function recordKey(t: IdempotencyTarget): string {
  return `api:idemp:${t.userId}:${t.scope}:${t.idempotencyKey}`;
}

function lockKey(t: IdempotencyTarget): string {
  return `api:idemp:lock:${t.userId}:${t.scope}:${t.idempotencyKey}`;
}

/**
 * Upstash deserializes JSON values on read by default, so the stored record
 * comes back as an object, not the string that was written. Accept both.
 */
export function parseIdempotencyRecord(raw: unknown): IdempotencyRecord | null {
  if (raw == null || raw === "") return null;
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.statusCode !== "number" || !Number.isInteger(rec.statusCode)) return null;
  if (typeof rec.body !== "string") return null;
  if (rec.location !== undefined && typeof rec.location !== "string") return null;
  if (rec.fingerprint !== undefined && typeof rec.fingerprint !== "string") return null;
  return {
    statusCode: rec.statusCode,
    body: rec.body,
    ...(typeof rec.location === "string" ? { location: rec.location } : {}),
    ...(typeof rec.fingerprint === "string" ? { fingerprint: rec.fingerprint } : {}),
  };
}

/**
 * Refuse to start a production API without the idempotency store.
 *
 * Every function here no-ops when the Redis client is missing (local dev, the
 * CF publish worker's stub), so a misconfigured production deploy would accept
 * Idempotency-Key and silently ignore it: an agent retrying a publish after a
 * timeout would post twice. `loadEnv()` already requires the Upstash vars, but
 * the client is still null when they do not parse or point at the worker stub.
 */
export function assertIdempotencyStoreConfigured(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  client: unknown = redis,
): void {
  if (nodeEnv === "production" && !client) {
    throw new Error(
      "Idempotency needs Redis in production: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN " +
        "did not produce a client. Fix them in backend/.env before starting the API.",
    );
  }
}

/** Returns the cached response for a duplicate idempotency key, or null. */
export async function getIdempotencyResponse(
  target: IdempotencyTarget,
): Promise<IdempotencyRecord | null> {
  if (!redis) return null;
  const raw = await redis.get<IdempotencyRecord | string>(recordKey(target));
  return parseIdempotencyRecord(raw);
}

export async function storeIdempotencyResponse(
  target: IdempotencyTarget,
  result: IdempotentResult,
): Promise<void> {
  if (!redis) return;
  const record: IdempotencyRecord = {
    statusCode: result.status,
    body: JSON.stringify(result.body ?? null),
    ...(result.location ? { location: result.location } : {}),
    fingerprint: target.fingerprint,
  };
  await redis.set(recordKey(target), JSON.stringify(record), { ex: IDEMPOTENCY_TTL_SEC });
}

/** Claim the in-flight slot for this key (prevents concurrent double publish). */
export async function claimIdempotencySlot(target: IdempotencyTarget): Promise<boolean> {
  if (!redis) return true;
  const wasSet = await redis.set(lockKey(target), "1", {
    nx: true,
    ex: IDEMPOTENCY_LOCK_TTL_SEC,
  });
  return wasSet !== null;
}

export async function releaseIdempotencySlot(target: IdempotencyTarget): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(lockKey(target));
  } catch {
    // The lock TTL is the fallback.
  }
}

/** The stored response, or 422 when the key was first used for another body. */
function replay(record: IdempotencyRecord, target: IdempotencyTarget): IdempotentResult {
  if (record.fingerprint !== undefined && record.fingerprint !== target.fingerprint) {
    return {
      status: 422,
      body: apiError(
        "idempotency_key_reused",
        "This Idempotency-Key was already used with a different request body. Use a new key for a new request.",
      ),
    };
  }
  let body: unknown;
  try {
    body = JSON.parse(record.body);
  } catch {
    body = null;
  }
  return {
    status: record.statusCode,
    body,
    ...(record.location ? { location: record.location } : {}),
  };
}

/**
 * Run `handler` at most once per (user, scope, key). A retry with the same
 * body gets the stored response, one with a different body gets 422
 * `idempotency_key_reused`, and a concurrent duplicate gets 409
 * `idempotency_conflict`. 5xx
 * results and thrown errors are not stored, so the client may retry them.
 */
export async function runIdempotent(
  target: IdempotencyTarget,
  handler: () => Promise<IdempotentResult>,
): Promise<IdempotentResult> {
  const cached = await getIdempotencyResponse(target);
  if (cached) return replay(cached, target);

  if (!(await claimIdempotencySlot(target))) {
    // The holder may have finished between our read and the claim.
    const late = await getIdempotencyResponse(target);
    if (late) return replay(late, target);
    return {
      status: 409,
      body: apiError("idempotency_conflict", "Request with this idempotency key is in progress."),
    };
  }

  // A request that finished and released the lock after our first read must
  // not run the handler a second time.
  const raced = await getIdempotencyResponse(target);
  if (raced) {
    await releaseIdempotencySlot(target);
    return replay(raced, target);
  }

  let result: IdempotentResult;
  try {
    result = await handler();
  } catch (err) {
    await releaseIdempotencySlot(target);
    throw err;
  }

  if (result.status >= 500) {
    await releaseIdempotencySlot(target);
    return result;
  }

  try {
    await storeIdempotencyResponse(target, result);
  } catch (err) {
    // The work already happened. Keep the lock so a quick retry gets 409
    // instead of repeating it, and still answer with the real result.
    console.error("[idempotency] failed to store response", err);
    return result;
  }
  await releaseIdempotencySlot(target);
  return result;
}

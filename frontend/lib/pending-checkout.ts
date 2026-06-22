import { db } from "@/db";
import { verification } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";

const PENDING_CHECKOUT_TTL_SEC = 3600;
const CHECKOUT_LOCK_TTL_SEC = 30;

export type PendingCheckout = {
  plan: "starter" | "growth";
  sessionId: string;
  url: string;
  trialPeriodDays: number;
  createdAt: number;
};

function pendingRedisKey(userId: string): string {
  return `checkout:pending:${userId}`;
}

function lockRedisKey(userId: string): string {
  return `checkout:lock:${userId}`;
}

function pendingDbIdentifier(userId: string): string {
  return `checkout-pending:${userId}`;
}

function parsePending(raw: unknown): PendingCheckout | null {
  if (!raw) return null;
  try {
    const data =
      typeof raw === "string" ? (JSON.parse(raw) as PendingCheckout) : (raw as PendingCheckout);
    if (
      (data.plan === "starter" || data.plan === "growth") &&
      typeof data.url === "string" &&
      typeof data.sessionId === "string"
    ) {
      return data;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getPendingCheckout(
  userId: string,
): Promise<PendingCheckout | null> {
  if (redis) {
    const raw = await redis.get<string>(pendingRedisKey(userId));
    return parsePending(raw);
  }

  const row = await db.query.verification.findFirst({
    where: and(
      eq(verification.identifier, pendingDbIdentifier(userId)),
      gt(verification.expiresAt, new Date()),
    ),
    columns: { value: true },
  });
  return row?.value ? parsePending(row.value) : null;
}

export async function savePendingCheckout(
  userId: string,
  pending: PendingCheckout,
): Promise<void> {
  const payload = JSON.stringify(pending);

  if (redis) {
    await redis.set(pendingRedisKey(userId), payload, {
      ex: PENDING_CHECKOUT_TTL_SEC,
    });
    return;
  }

  const identifier = pendingDbIdentifier(userId);
  await db.delete(verification).where(eq(verification.identifier, identifier));
  await db.insert(verification).values({
    id: randomUUID(),
    identifier,
    value: payload,
    expiresAt: new Date(Date.now() + PENDING_CHECKOUT_TTL_SEC * 1000),
  });
}

export async function clearPendingCheckout(userId: string): Promise<void> {
  if (redis) {
    await redis.del(pendingRedisKey(userId));
    return;
  }

  await db
    .delete(verification)
    .where(eq(verification.identifier, pendingDbIdentifier(userId)));
}

async function acquireCheckoutLock(userId: string): Promise<boolean> {
  if (!redis) return true;
  const acquired = await redis.set(lockRedisKey(userId), "1", {
    nx: true,
    ex: CHECKOUT_LOCK_TTL_SEC,
  });
  return acquired !== null;
}

async function releaseCheckoutLock(userId: string): Promise<void> {
  if (!redis) return;
  await redis.del(lockRedisKey(userId));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ResolveCheckoutResult =
  | { ok: true; url: string; reused: boolean }
  | { ok: false; code: "checkout_in_progress"; error: string; url?: string };

/**
 * Returns an existing open checkout for this user, or creates one via `createSession`.
 * Serializes concurrent requests (double-tab / double-click) to a single Dodo session.
 */
export async function resolveCheckoutSession(params: {
  userId: string;
  plan: "starter" | "growth";
  trialPeriodDays: number;
  createSession: () => Promise<{ sessionId: string; url: string }>;
}): Promise<ResolveCheckoutResult> {
  const { userId, plan, trialPeriodDays, createSession } = params;

  const existing = await getPendingCheckout(userId);
  if (existing) {
    if (existing.plan === plan) {
      return { ok: true, url: existing.url, reused: true };
    }
    return {
      ok: false,
      code: "checkout_in_progress",
      error:
        "A checkout is already in progress for this account. Complete or close it before starting another.",
      url: existing.url,
    };
  }

  const lockAcquired = await acquireCheckoutLock(userId);
  if (!lockAcquired) {
    for (let i = 0; i < 20; i++) {
      await sleep(150);
      const raced = await getPendingCheckout(userId);
      if (raced) {
        if (raced.plan === plan) {
          return { ok: true, url: raced.url, reused: true };
        }
        return {
          ok: false,
          code: "checkout_in_progress",
          error:
            "A checkout is already in progress for this account. Complete or close it before starting another.",
          url: raced.url,
        };
      }
    }
    return {
      ok: false,
      code: "checkout_in_progress",
      error: "Checkout is already being prepared. Try again in a few seconds.",
    };
  }

  try {
    const again = await getPendingCheckout(userId);
    if (again) {
      if (again.plan === plan) {
        return { ok: true, url: again.url, reused: true };
      }
      return {
        ok: false,
        code: "checkout_in_progress",
        error:
          "A checkout is already in progress for this account. Complete or close it before starting another.",
        url: again.url,
      };
    }

    const session = await createSession();
    const pending: PendingCheckout = {
      plan,
      sessionId: session.sessionId,
      url: session.url,
      trialPeriodDays,
      createdAt: Date.now(),
    };
    await savePendingCheckout(userId, pending);
    return { ok: true, url: session.url, reused: false };
  } finally {
    await releaseCheckoutLock(userId);
  }
}

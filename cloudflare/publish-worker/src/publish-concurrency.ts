/**
 * Fleet-wide per-platform publish concurrency via Upstash Redis REST.
 * Fail-open if Redis is missing/stubbed so publishes still proceed.
 */
import { maxConcurrentPublishesForPlatform } from "../../../backend/shared/src/constants/platform-publish-concurrency";

const SLOT_TTL_SEC = 15 * 60;

function redisConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  if (!url || !token) return false;
  if (url.includes("worker-unused")) return false;
  if (token.includes("worker-unused")) return false;
  return true;
}

async function redisCommand(args: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`Upstash ${res.status}`);
  }
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

function slotKey(platform: string): string {
  return `publish:inflight:${platform}`;
}

export type PublishSlot = {
  platform: string;
  member: string;
  release: () => Promise<void>;
};

/**
 * Acquire a publish slot for `platform`. Retries a few times then fails open.
 */
export async function acquirePlatformPublishSlot(
  platform: string,
  jobId: string,
): Promise<PublishSlot | null> {
  if (!redisConfigured()) return null;

  const max = maxConcurrentPublishesForPlatform(platform);
  const key = slotKey(platform);
  const member = `${jobId}:${Date.now()}`;
  const now = Date.now();

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      // Drop expired members (score = expiry ms)
      await redisCommand(["ZREMRANGEBYSCORE", key, 0, now]);
      const count = Number(await redisCommand(["ZCARD", key]));
      if (count < max) {
        await redisCommand(["ZADD", key, now + SLOT_TTL_SEC * 1000, member]);
        return {
          platform,
          member,
          release: async () => {
            try {
              await redisCommand(["ZREM", key, member]);
            } catch (e) {
              console.error("[publish-concurrency] release failed", e);
            }
          },
        };
      }
    } catch (e) {
      console.warn(
        "[publish-concurrency] redis unavailable, fail-open",
        e instanceof Error ? e.message : e,
      );
      return null;
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }

  // Still saturated — proceed fail-open after waiting (avoid infinite queue stall)
  console.warn(
    `[publish-concurrency] ${platform} at cap ${max}, proceeding fail-open`,
  );
  return null;
}

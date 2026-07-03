import type { SecondaryStorage } from "@better-auth/core/db";
import type { Redis } from "@upstash/redis";

const KEY_PREFIX = "auth:";
const REDIS_TIMEOUT_MS = 2_500;

function prefixed(key: string) {
  return `${KEY_PREFIX}${key}`;
}

async function withRedisTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Redis timeout (${label})`)),
          REDIS_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err) {
    console.warn(
      `[redis] ${label} failed, using fallback:`,
      err instanceof Error ? err.message : err,
    );
    return fallback;
  }
}

/** Better Auth secondary storage backed by Upstash Redis. */
export function createAuthSecondaryStorage(client: Redis): SecondaryStorage {
  return {
    async get(key) {
      return withRedisTimeout(`auth:get:${key}`, async () => {
        const value = await client.get<string>(prefixed(key));
        return value ?? null;
      }, null);
    },
    async set(key, value, ttl) {
      await withRedisTimeout(`auth:set:${key}`, async () => {
        if (ttl && ttl > 0) {
          await client.set(prefixed(key), value, { ex: ttl });
          return;
        }
        await client.set(prefixed(key), value);
      }, undefined);
    },
    async delete(key) {
      await withRedisTimeout(
        `auth:del:${key}`,
        () => client.del(prefixed(key)),
        undefined,
      );
    },
  };
}

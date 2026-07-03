import type { SecondaryStorage } from "@better-auth/core/db";
import type { Redis } from "@upstash/redis";
import { withRedisTimeout } from "./redis-safe.js";

const KEY_PREFIX = "auth:";

function prefixed(key: string) {
  return `${KEY_PREFIX}${key}`;
}

/**
 * Better Auth secondary storage backed by Upstash Redis.
 * ponytail: Redis is a cache/rate-limit layer only — sessions live in Postgres.
 * Any Redis error or timeout is ignored so auth never blocks the site.
 */
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

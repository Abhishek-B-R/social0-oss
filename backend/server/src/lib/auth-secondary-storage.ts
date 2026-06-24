import type { SecondaryStorage } from "@better-auth/core/db";
import type { Redis } from "@upstash/redis";

const KEY_PREFIX = "auth:";

function prefixed(key: string) {
  return `${KEY_PREFIX}${key}`;
}

/** Better Auth secondary storage backed by Upstash Redis. */
export function createAuthSecondaryStorage(client: Redis): SecondaryStorage {
  return {
    async get(key) {
      const value = await client.get<string>(prefixed(key));
      return value ?? null;
    },
    async set(key, value, ttl) {
      if (ttl && ttl > 0) {
        await client.set(prefixed(key), value, { ex: ttl });
        return;
      }
      await client.set(prefixed(key), value);
    },
    async delete(key) {
      await client.del(prefixed(key));
    },
  };
}

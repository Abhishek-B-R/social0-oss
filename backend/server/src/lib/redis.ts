import { Redis } from "@upstash/redis";
import { resolveUpstashRedisConfig } from "@social0/shared";

function createRedisClient(): Redis | null {
  try {
    const config = resolveUpstashRedisConfig(process.env);
    // ponytail: CF publish worker stubs Redis so loadServerEnv() passes; never connect.
    if (config.restUrl.includes("worker-unused")) return null;
    return new Redis({ url: config.restUrl, token: config.restToken });
  } catch {
    return null;
  }
}

/** Shared Upstash client for rate limits, auth session cache, and webhooks. */
export const redis = createRedisClient();

export const upstashConfig = redis
  ? resolveUpstashRedisConfig(process.env)
  : null;

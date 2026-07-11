import { Redis } from "@upstash/redis";
import { resolveUpstashRedisConfig } from "@social0/shared";

function createRedisClient(): Redis | null {
  try {
    const config = resolveUpstashRedisConfig(process.env);
    return new Redis({ url: config.restUrl, token: config.restToken });
  } catch {
    return null;
  }
}

export const redis = createRedisClient();

export const upstashConfig = redis
  ? resolveUpstashRedisConfig(process.env)
  : null;

import { Redis } from "@upstash/redis";
import { resolveUpstashRedisConfig } from "@social0/shared";

const config = resolveUpstashRedisConfig(process.env);

/** Shared Upstash client for rate limits, auth session cache, and webhooks. */
export const redis = new Redis({ url: config.restUrl, token: config.restToken });

export { config as upstashConfig };

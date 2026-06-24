import { Redis } from "@upstash/redis";
import { resolveUpstashRedisConfig } from "@social0/shared";

const config = resolveUpstashRedisConfig(process.env);

export const redis = new Redis({ url: config.restUrl, token: config.restToken });

export { config as upstashConfig };

import type { ConnectionOptions } from "bullmq";
import { loadEnv } from "@social0/shared";

export function createRedisConnection(): ConnectionOptions {
  const env = loadEnv();
  return {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
  };
}

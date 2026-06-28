import type { ConnectionOptions } from "bullmq";
import { getRedisUrl } from "@social0/shared";

export function createRedisConnection(): ConnectionOptions {
  return {
    url: getRedisUrl(),
    maxRetriesPerRequest: null,
  };
}

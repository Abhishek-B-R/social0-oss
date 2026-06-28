import { z } from "zod";
import { resolveUpstashRedisConfig } from "./redis-config.js";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  /** Optional - rediss:// URL from Upstash console; derived from REST creds when omitted. */
  UPSTASH_REDIS_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}

/** BullMQ + job-progress ioredis URL (same Upstash DB as REST client). */
export function getRedisUrl(env: Env = loadEnv()): string {
  return resolveUpstashRedisConfig(env).redisUrl;
}

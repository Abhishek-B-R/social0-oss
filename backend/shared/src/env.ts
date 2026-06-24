import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  DATABASE_URL: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  WORKER_PUBLISH_CONCURRENCY: z.coerce.number().default(5),
  WORKER_PLATFORM_CONCURRENCY: z.coerce.number().default(20),
  WORKER_EMAIL_CONCURRENCY: z.coerce.number().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}

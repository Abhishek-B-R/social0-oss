import { defineConfig } from "vitest/config";

/**
 * The cron entrypoints reach `process.env` through `loadWorkerEnv()` at first
 * DB use. Tests mock the DB, but the publish-dispatch router reads env directly,
 * so give it the shape a deployed worker has.
 */
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
      ENCRYPTION_KEY: "0".repeat(64),
      NEXT_PUBLIC_APP_URL: "http://localhost:5173",
    },
  },
});

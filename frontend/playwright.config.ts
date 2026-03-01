import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || "https://localhost:3000",
    // Required: self-signed cert used by Next.js --experimental-https
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    channel: "chrome",
    headless: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

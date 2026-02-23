import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.TEST_BASE_URL || "https://localhost:3000",
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
    channel: "chrome",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

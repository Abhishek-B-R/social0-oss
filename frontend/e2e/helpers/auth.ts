import { Page } from "@playwright/test";

export async function loginAsTestUser(page: Page) {
  // Navigate to the test signin route. It creates a session, sets the
  // better-auth.session_token cookie, and redirects to /dashboard — identical
  // to a real OAuth callback so the browser handles everything natively.
  const response = await page.goto("/api/auth/test-signin");

  if (!response || !response.ok()) {
    throw new Error(
      `Test signin failed — route returned HTTP ${response?.status() ?? "unknown"}.\n` +
        `Ensure ALLOW_TEST_SIGNIN=true is in .env.test (and .env.local) and ` +
        `the dev server has been restarted after adding it.`,
    );
  }

  // After the redirect the browser should be on /dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
}

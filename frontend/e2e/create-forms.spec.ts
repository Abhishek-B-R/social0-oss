import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test.describe("Create forms (index)", () => {
  test("create page shows Text, Image, Video, Threads, and Collection post type cards", async ({
    page,
  }) => {
    test.setTimeout(15000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create/);

    await expect(
      page.getByRole("heading", { name: "Create a new post" }),
    ).toBeVisible({ timeout: 10000 });

    await expect(page.locator('a[href="/dashboard/create/text"]')).toBeVisible();
    await expect(
      page.locator('a[href="/dashboard/create/image"]'),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/dashboard/create/video"]'),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/dashboard/create/threads"]'),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/dashboard/create/collection"]'),
    ).toBeVisible();
  });
});

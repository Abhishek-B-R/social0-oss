import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import path from "path";

test.describe("Bulk upload", () => {
  test("bulk tools index page loads with both upload options", async ({
    page,
  }) => {
    test.setTimeout(15000);

    await loginAsTestUser(page);
    await page.goto("/dashboard/bulk-tools");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/bulk-tools/);

    // Page heading
    await expect(
      page.getByRole("heading", { name: "Bulk tools" }),
    ).toBeVisible({ timeout: 10000 });

    // Both cards are present and link to the right sub-pages
    await expect(
      page.locator('a[href="/dashboard/bulk-tools/video"]'),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/dashboard/bulk-tools/image"]'),
    ).toBeVisible();
  });

  test("bulk video upload page loads", async ({ page }) => {
    test.setTimeout(15000);

    await loginAsTestUser(page);
    await page.goto("/dashboard/bulk-tools/video");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/bulk-tools\/video/);

    // File input must be attached (may be visually hidden)
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
  });

  test("bulk image upload page loads", async ({ page }) => {
    test.setTimeout(15000);

    await loginAsTestUser(page);
    await page.goto("/dashboard/bulk-tools/image");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/bulk-tools\/image/);

    // File input must be attached (may be visually hidden)
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
  });

  test("bulk image: add image(s) and see them in the list", async ({
    page,
  }) => {
    test.setTimeout(20000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/bulk-tools/image");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/bulk-tools\/image/);

    const fileInput = page.locator('input[type="file"][accept*="image"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    const imagePath = path.join(__dirname, "../fixtures/test-image.jpg");
    await fileInput.setInputFiles(imagePath);

    await expect(
      page.getByRole("heading", { name: /Your Images \(1\)/ }),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByRole("button", { name: "Collapse all" }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("button", { name: "Expand all" }),
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByRole("button", { name: "Schedule All 1 Images" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("bulk image: add multiple images and see count update", async ({
    page,
  }) => {
    test.setTimeout(20000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/bulk-tools/image");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/bulk-tools\/image/);

    const fileInput = page.locator('input[type="file"][accept*="image"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    const imagePath = path.join(__dirname, "../fixtures/test-image.jpg");
    await fileInput.setInputFiles([imagePath, imagePath]);

    await expect(
      page.getByRole("heading", { name: /Your Images \(2\)/ }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("button", { name: "Schedule All 2 Images" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("bulk video: add video and see it in the list", async ({ page }) => {
    test.setTimeout(25000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/bulk-tools/video");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/bulk-tools\/video/);

    const fileInput = page.locator('input[type="file"][accept*="video"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    const videoPath = path.join(__dirname, "../fixtures/test-video.mp4");
    await fileInput.setInputFiles(videoPath);

    await expect(
      page.getByRole("heading", { name: /Your Videos \(1\)/ }),
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByRole("button", { name: "Schedule All 1 Videos" }),
    ).toBeVisible({ timeout: 5000 });
  });
});

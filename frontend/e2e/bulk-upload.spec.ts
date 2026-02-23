import { test, expect } from "@playwright/test";
import path from "path";

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

test.describe("Bulk upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    if (TEST_USER_EMAIL && TEST_USER_PASSWORD) {
      const signIn = page.getByRole("link", { name: /sign in|log in|try it free/i }).first();
      if (await signIn.isVisible()) {
        await signIn.click();
        await page.waitForURL(/\/auth|google|signin/, { timeout: 5000 }).catch(() => {});
        const emailInput = page.getByLabel(/email/i).first();
        if (await emailInput.isVisible()) {
          await emailInput.fill(TEST_USER_EMAIL);
          await page.getByLabel(/password/i).first().fill(TEST_USER_PASSWORD);
          await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
          await page.waitForURL(/\/(dashboard|posts)/, { timeout: 15000 });
        }
      }
    }
  });

  test("bulk video upload: upload files, apply schedule, verify dates", async ({ page }) => {
    await page.goto("/dashboard/bulk-tools");

    await expect(page.getByText("Bulk Video Upload")).toBeVisible();
    await expect(page.getByText("Bulk Image Upload")).toBeVisible();

    await page.getByRole("link", { name: /Bulk Video Upload/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/bulk-tools\/video/);

    const video1 = path.join(__dirname, "../fixtures/test-video.mp4");
    const video2 = path.join(__dirname, "../fixtures/test-video-2.mp4");
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([video1, video2]);

    await expect(page.getByText(/Your Videos \(2\)/)).toBeVisible({ timeout: 10000 });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startDateStr = tomorrow.toISOString().slice(0, 10);

    await page.getByLabel(/Start Date/i).fill(startDateStr);
    await page.getByLabel(/Videos per day|per day/i).selectOption("1");
    await page.getByLabel(/Time between posts|gap|hours/i).selectOption({ label: "24 hours" }).catch(() => {
      return page.locator('select').filter({ has: page.locator('option[value="24"]') }).selectOption("24");
    });

    await page.getByRole("button", { name: /Apply Bulk Schedule/i }).click();

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    const dayAfterStr = dayAfterTomorrow.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const tomorrowStr = tomorrow.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    await expect(page.getByText(tomorrowStr)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(dayAfterStr)).toBeVisible({ timeout: 5000 });
  });
});

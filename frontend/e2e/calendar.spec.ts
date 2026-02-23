import { test, expect } from "@playwright/test";

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

test.describe("Calendar", () => {
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

  test("navigate calendar, month/week, nav arrows", async ({ page }) => {
    await page.goto("/dashboard/calendar");

    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    const monthName = new Date().toLocaleString("default", { month: "long" });
    await expect(page.getByText(monthName)).toBeVisible();

    const todayCell = page.locator("[data-date]").filter({
      has: page.locator(".bg-emerald-50\\/50, [class*='emerald']"),
    }).first();
    await expect(todayCell.or(page.getByText("Today").locator(".."))).toBeVisible();

    await expect(page.getByRole("button", { name: "Month" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Week" })).toBeVisible();

    await page.getByRole("button", { name: "Week" }).click();
    await expect(page.getByText(/Week of/)).toBeVisible();

    await page.getByRole("button", { name: /Previous/ }).click();
    await page.getByRole("button", { name: /Next/ }).click();
    await expect(page.getByText(monthName)).toBeVisible();
  });
});

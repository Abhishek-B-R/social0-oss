import { test, expect } from "@playwright/test";

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

test.describe("Draft lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    if (TEST_USER_EMAIL && TEST_USER_PASSWORD) {
      const signIn = page.getByRole("link", { name: /sign in|log in|try it free/i }).first();
      if (await signIn.isVisible()) {
        await signIn.click();
        await page.waitForURL(/\/auth|google|signin/);
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

  test("create → edit → delete draft", async ({ page }) => {
    await page.goto("/dashboard/posts/new");
    await page.getByRole("link", { name: /Text Post/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/posts\/new\/text/);

    const uniqueCaption = "Test draft " + Date.now();
    await page.getByLabel(/What do you want to post/i).fill(uniqueCaption);

    await page.getByRole("button", { name: /save as draft/i }).click();
    await page.getByRole("button", { name: "Save draft" }).click();

    await expect(page).toHaveURL(/\/(dashboard\/posts|dashboard\/posts\/drafts)/);

    const cardWithCaption = page.locator("li").filter({ hasText: uniqueCaption }).first();
    await expect(cardWithCaption).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Draft").first()).toBeVisible();

    await cardWithCaption.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/dashboard\/posts\/[^/]+\/edit/);
    await expect(page.getByLabel(/What do you want to post/i)).toHaveValue(uniqueCaption);

    await page.goto("/dashboard/posts/drafts");
    const draftCard = page.locator("li").filter({ hasText: uniqueCaption }).first();
    await draftCard.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText(uniqueCaption)).not.toBeVisible();
  });
});

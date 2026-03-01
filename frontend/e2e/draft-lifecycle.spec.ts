import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test.describe("Draft lifecycle", () => {
  test("create → edit → delete draft", async ({ page }) => {
    test.setTimeout(15000);

    await loginAsTestUser(page);

    // Navigate to the create page
    await page.goto("/dashboard/create");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create/);

    // Click the "Text Post" card — it links directly to /dashboard/create/text
    const textPostCard = page.locator('a[href="/dashboard/create/text"]').first();
    await expect(textPostCard).toBeVisible({ timeout: 10000 });
    await textPostCard.click();
    await page.waitForURL(/\/dashboard\/create\/text/, { timeout: 10000 });

    // Select at least one account (required for save to succeed).
    // Button may say "Select all" or "Deselect all" when all are already selected.
    const accountToggleBtn = page.getByRole("button", { name: /Select all|Deselect all/ });
    await expect(accountToggleBtn).toBeVisible({ timeout: 10000 });
    if ((await accountToggleBtn.textContent())?.trim() === "Select all") {
      await accountToggleBtn.click();
    }

    // Fill in the textarea (placeholder: "Write your post...")
    const uniqueCaption = "Test draft " + Date.now();
    const textarea = page.locator('textarea[placeholder="What\'s on your mind?"], textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill(uniqueCaption);

    // Click "Save to Drafts" in the sidebar
    const saveDraftButton = page.getByRole("button", { name: /save.*draft/i, exact: false }).first();
    await expect(saveDraftButton).toBeVisible({ timeout: 10000 });
    await saveDraftButton.click();

    // Should redirect to posts or drafts list
    await page.waitForURL(/\/(dashboard\/posts\/drafts|dashboard\/posts)(?:\/|$)/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    // If we landed on /dashboard/posts, go to drafts to find our draft
    if (page.url().includes("/dashboard/posts") && !page.url().includes("/drafts")) {
      await page.goto("/dashboard/posts/drafts");
      await page.waitForLoadState("networkidle");
    }

    // Our draft caption should be visible in the list
    await expect(page.getByText(uniqueCaption)).toBeVisible({ timeout: 10000 });

    // Click the draft card — it redirects to /dashboard/create/text?draft={id}
    await page.getByText(uniqueCaption).click();
    await page.waitForURL(/\/dashboard\/create\/text\?draft=/, {
      timeout: 10000,
    });
    await page.waitForLoadState("networkidle");

    // "Delete draft" button is shown in the sidebar when editing an existing draft
    const deleteButton = page.getByRole("button", { name: "Delete draft" });
    await expect(deleteButton).toBeVisible({ timeout: 10000 });

    // Handle the native window.confirm dialog that the delete button triggers
    page.once("dialog", (dialog) => dialog.accept());
    await deleteButton.click();

    // After deletion, redirects back to the drafts page
    await page.waitForURL(/\/dashboard\/posts\/drafts/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // The draft should no longer appear
    await expect(page.getByText(uniqueCaption)).not.toBeVisible();
  });
});

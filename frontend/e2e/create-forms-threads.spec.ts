import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

/** When set (e.g. E2E_MANUAL_MEDIA=1), tests click the Add media zone and wait 5s for you to select a file. */
const useManualMedia =
  process.env.E2E_MANUAL_MEDIA === "1" ||
  process.env.E2E_MANUAL_MEDIA === "true";

test.describe("Create forms – ThreadsPostForm", () => {
  test("threads post form loads with thread posts and Save to Drafts", async ({
    page,
  }) => {
    test.setTimeout(15000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/threads");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/threads/);

    await expect(
      page.getByText("Thread posts (stacked in order when published)", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 10000 });

    const threadTextarea = page.locator(
      'textarea[placeholder="What\'s happening?"]',
    );
    await expect(threadTextarea.first()).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByRole("button", { name: "Add another post" }),
    ).toBeVisible({ timeout: 5000 });

    const saveDraftBtn = page
      .getByRole("button", { name: /save.*draft/i, exact: false })
      .first();
    await expect(saveDraftBtn).toBeVisible({ timeout: 5000 });
  });

  test("threads post can save draft with text (optional media via E2E_MANUAL_MEDIA)", async ({
    page,
  }) => {
    test.setTimeout(useManualMedia ? 60000 : 30000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/threads");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/threads/);

    const accountToggleBtn = page.getByRole("button", {
      name: /Select all|Deselect all/,
    });
    await expect(accountToggleBtn).toBeVisible({ timeout: 10000 });
    if ((await accountToggleBtn.textContent())?.trim() === "Select all") {
      await accountToggleBtn.click();
    }

    const uniqueCaption = "Threads draft " + Date.now();
    const threadTextarea = page.locator(
      'textarea[placeholder="What\'s happening?"]',
    ).first();
    await expect(threadTextarea).toBeVisible({ timeout: 5000 });
    await threadTextarea.fill(uniqueCaption);

    if (useManualMedia) {
      const addMediaLabel = page
        .locator("label")
        .filter({ hasText: /Add media/ })
        .first();
      await addMediaLabel.click();
      await page.waitForTimeout(5000);
    }

    const saveDraftBtn = page
      .getByRole("button", { name: /save.*draft/i, exact: false })
      .first();
    await expect(saveDraftBtn).toBeVisible({ timeout: 5000 });
    await saveDraftBtn.click();

    await page.waitForURL(
      /\/(dashboard\/posts\/drafts|dashboard\/posts)(?:\/|$)/,
      { timeout: 25000 },
    );
    await page.waitForLoadState("networkidle");
    if (
      page.url().includes("/dashboard/posts") &&
      !page.url().includes("/drafts")
    ) {
      await page.goto("/dashboard/posts/drafts");
      await page.waitForLoadState("networkidle");
    }
    await expect(page.getByText(uniqueCaption)).toBeVisible({
      timeout: 10000,
    });
  });
});

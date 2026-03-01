import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import path from "path";

/** When set (e.g. E2E_MANUAL_MEDIA=1), tests click the upload zone and wait 5s for you to select a file instead of using fixture files. */
const useManualMedia =
  process.env.E2E_MANUAL_MEDIA === "1" ||
  process.env.E2E_MANUAL_MEDIA === "true";

test.describe("Create forms – CollectionPostForm", () => {
  test("collection post form loads with caption and upload zone", async ({
    page,
  }) => {
    test.setTimeout(15000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/collection");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/collection/);

    await expect(
      page.getByText("Collection of images and videos (one post)", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 10000 });

    const captionField = page.locator(
      'textarea[placeholder="Write your caption..."]',
    );
    await expect(captionField.first()).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByRole("button", { name: "Click to add images or videos" }),
    ).toBeVisible({ timeout: 5000 });

    const saveDraftBtn = page
      .getByRole("button", { name: /save.*draft/i, exact: false })
      .first();
    await expect(saveDraftBtn).toBeVisible({ timeout: 5000 });
  });

  test("collection post can save draft with caption (optional media via E2E_MANUAL_MEDIA)", async ({
    page,
  }) => {
    test.setTimeout(useManualMedia ? 60000 : 30000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/collection");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/collection/);

    const accountToggleBtn = page.getByRole("button", {
      name: /Select all|Deselect all/,
    });
    await expect(accountToggleBtn).toBeVisible({ timeout: 10000 });
    if ((await accountToggleBtn.textContent())?.trim() === "Select all") {
      await accountToggleBtn.click();
    }

    if (useManualMedia) {
      await page
        .getByRole("button", { name: "Click to add images or videos" })
        .click();
      await page.waitForTimeout(5000);
    } else {
      const fileInput = page.locator(
        'input[type="file"][accept*="image"]',
      ).first();
      await expect(fileInput).toBeAttached({ timeout: 5000 });
      const imagePath = path.join(__dirname, "../fixtures/test-image.jpg");
      await fileInput.setInputFiles(imagePath);
    }

    const uniqueCaption = "Collection draft " + Date.now();
    const captionField = page.locator(
      'textarea[placeholder="Write your caption..."]',
    ).first();
    await expect(captionField).toBeVisible({ timeout: 5000 });
    await captionField.fill(uniqueCaption);

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

import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import path from "path";

/** When set (e.g. E2E_MANUAL_MEDIA=1), tests click the upload zone and wait 5s for you to select a file instead of using fixture files. */
const useManualMedia =
  process.env.E2E_MANUAL_MEDIA === "1" ||
  process.env.E2E_MANUAL_MEDIA === "true";

function getFutureDate(): { dateStr: string; timeStr: string } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return { dateStr: `${yyyy}-${mm}-${dd}`, timeStr: `${hh}:${min}` };
}

async function selectAccountsAndUploadImage(
  page: import("@playwright/test").Page,
) {
  const accountToggleBtn = page.getByRole("button", {
    name: /Select all|Deselect all/,
  });
  await expect(accountToggleBtn).toBeVisible({ timeout: 10000 });
  if ((await accountToggleBtn.textContent())?.trim() === "Select all") {
    await accountToggleBtn.click();
  }

  if (useManualMedia) {
    await page
      .getByRole("button", { name: /Click to add image|Add more/ })
      .first()
      .click();
    await page.waitForTimeout(5000);
  } else {
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    const imagePath = path.join(__dirname, "../fixtures/test-image.jpg");
    await fileInput.setInputFiles(imagePath);
  }
  await expect(
    page.getByRole("button", { name: "Add more" }),
  ).toBeVisible({ timeout: useManualMedia ? 15000 : 10000 });
}

test.describe("Create forms – ImagePostForm", () => {
  test("image post form loads with upload zone and caption", async ({
    page,
  }) => {
    test.setTimeout(15000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/image");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/image/);

    await expect(
      page.getByText("Images & caption", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByRole("button", { name: /Click to add image|Add more/ }),
    ).toBeVisible({ timeout: 5000 });

    const captionField = page.locator(
      'textarea[placeholder="Add a caption..."]',
    );
    await expect(captionField.first()).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByRole("button", { name: "Post now" }),
    ).toBeVisible({ timeout: 5000 });
    const saveDraftBtn = page
      .getByRole("button", { name: /save.*draft/i, exact: false })
      .first();
    await expect(saveDraftBtn).toBeVisible({ timeout: 5000 });
  });

  test("Save to Drafts – selects accounts, adds image, fills caption, saves draft, shows success overlay", async ({
    page,
  }) => {
    test.setTimeout(useManualMedia ? 60000 : 35000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/image");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/image/);

    await selectAccountsAndUploadImage(page);

    const uniqueCaption = "Image draft " + Date.now();
    const captionField = page.locator(
      'textarea[placeholder="Add a caption..."]',
    ).first();
    await expect(captionField).toBeVisible({ timeout: 5000 });
    await captionField.fill(uniqueCaption);

    const saveDraftBtn = page
      .getByRole("button", { name: /save.*draft/i, exact: false })
      .first();
    await expect(saveDraftBtn).toBeVisible({ timeout: 5000 });
    await saveDraftBtn.click();

    await expect(
      page.getByRole("heading", { name: "Draft saved!" }),
    ).toBeVisible({ timeout: 25000 });
    await page.getByRole("link", { name: "View draft" }).click();
    await page.waitForURL(
      /\/dashboard\/posts\/(?!drafts|scheduled|posted)[^/]+$/,
      { timeout: 25000 },
    );
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(uniqueCaption)).toBeVisible({
      timeout: 10000,
    });
  });

  test("Post now – selects accounts, adds image, fills caption, clicks Post now, redirects to posts", async ({
    page,
  }) => {
    test.setTimeout(useManualMedia ? 60000 : 35000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/image");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/image/);

    await selectAccountsAndUploadImage(page);

    const uniqueCaption = "Post now image " + Date.now();
    const captionField = page.locator(
      'textarea[placeholder="Add a caption..."]',
    ).first();
    await expect(captionField).toBeVisible({ timeout: 5000 });
    await captionField.fill(uniqueCaption);

    const postNowBtn = page.getByRole("button", { name: "Post now" }).first();
    await expect(postNowBtn).toBeVisible({ timeout: 5000 });
    await postNowBtn.click();

    await page.waitForURL(/\/dashboard\/posts(?:\/|$)/, { timeout: 25000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/posts/);
  });

  test("Schedule – selects accounts, adds image, fills caption, enables schedule, sets future time, schedules", async ({
    page,
  }) => {
    test.setTimeout(useManualMedia ? 70000 : 40000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/image");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/image/);

    await selectAccountsAndUploadImage(page);

    const uniqueCaption = "Scheduled image " + Date.now();
    const captionField = page.locator(
      'textarea[placeholder="Add a caption..."]',
    ).first();
    await expect(captionField).toBeVisible({ timeout: 5000 });
    await captionField.fill(uniqueCaption);

    const scheduleSwitch = page.getByRole("switch").first();
    await expect(scheduleSwitch).toBeVisible({ timeout: 5000 });
    await scheduleSwitch.click();

    const { dateStr, timeStr } = getFutureDate();
    const dateInput = page.locator("#schedule-date");
    const timeInput = page.locator("#schedule-time");
    await expect(dateInput).toBeVisible({ timeout: 5000 });
    await expect(timeInput).toBeVisible({ timeout: 5000 });
    await dateInput.fill(dateStr);
    await timeInput.fill(timeStr);

    const scheduleBtn = page
      .getByRole("button", { name: "Schedule", exact: true })
      .first();
    await expect(scheduleBtn).toBeVisible({ timeout: 5000 });
    await scheduleBtn.click();

    await page.waitForURL(/\/dashboard\/posts\/scheduled(?:\/|$)/, {
      timeout: 25000,
    });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/posts\/scheduled/);
  });
});

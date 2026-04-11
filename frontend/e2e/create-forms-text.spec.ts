import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

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

test.describe("Create forms – TextPostForm", () => {
  test("text post form loads with caption field and action buttons", async ({
    page,
  }) => {
    test.setTimeout(15000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/text");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/text/);

    const accountToggleBtn = page.getByRole("button", {
      name: /Select all|Deselect all/,
    });
    await expect(accountToggleBtn).toBeVisible({ timeout: 10000 });

    const textarea = page
      .locator('textarea[placeholder="What\'s on your mind?"], textarea')
      .first();
    await expect(textarea).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByRole("button", { name: "Post now" }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("button", { name: "Save to Drafts" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Save to Drafts – selects accounts, fills text, saves draft, shows success overlay", async ({
    page,
  }) => {
    test.setTimeout(30000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/text");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/text/);

    const accountToggleBtn = page.getByRole("button", {
      name: /Select all|Deselect all/,
    });
    await expect(accountToggleBtn).toBeVisible({ timeout: 10000 });
    if ((await accountToggleBtn.textContent())?.trim() === "Select all") {
      await accountToggleBtn.click();
    }

    const uniqueCaption = "Text draft " + Date.now();
    const textarea = page
      .locator('textarea[placeholder="What\'s on your mind?"], textarea')
      .first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill(uniqueCaption);

    const saveDraftBtn = page
      .getByRole("button", { name: "Save to Drafts" })
      .first();
    await expect(saveDraftBtn).toBeVisible({ timeout: 5000 });
    await saveDraftBtn.click();

    await expect(
      page.getByRole("heading", { name: "Draft saved!" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "View draft" }).click();
    await page.waitForURL(
      /\/dashboard\/posts\/(?!drafts|scheduled|posted)[^/]+$/,
      { timeout: 15000 },
    );
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(uniqueCaption)).toBeVisible({
      timeout: 10000,
    });
  });

  test("Post now – selects accounts, fills text, clicks Post now, redirects to posts", async ({
    page,
  }) => {
    test.setTimeout(30000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/text");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/text/);

    const accountToggleBtn = page.getByRole("button", {
      name: /Select all|Deselect all/,
    });
    await expect(accountToggleBtn).toBeVisible({ timeout: 10000 });
    if ((await accountToggleBtn.textContent())?.trim() === "Select all") {
      await accountToggleBtn.click();
    }

    const uniqueCaption = "Post now " + Date.now();
    const textarea = page
      .locator('textarea[placeholder="What\'s on your mind?"], textarea')
      .first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill(uniqueCaption);

    const postNowBtn = page.getByRole("button", { name: "Post now" }).first();
    await expect(postNowBtn).toBeVisible({ timeout: 5000 });
    await postNowBtn.click();

    await page.waitForURL(/\/dashboard\/posts(?:\/|$)/, { timeout: 20000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/posts/);
  });

  test("Schedule – selects accounts, fills text, enables schedule, sets future time, schedules", async ({
    page,
  }) => {
    test.setTimeout(35000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/text");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/text/);

    const accountToggleBtn = page.getByRole("button", {
      name: /Select all|Deselect all/,
    });
    await expect(accountToggleBtn).toBeVisible({ timeout: 10000 });
    if ((await accountToggleBtn.textContent())?.trim() === "Select all") {
      await accountToggleBtn.click();
    }

    const uniqueCaption = "Scheduled text " + Date.now();
    const textarea = page
      .locator('textarea[placeholder="What\'s on your mind?"], textarea')
      .first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill(uniqueCaption);

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
      timeout: 20000,
    });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/posts\/scheduled/);
  });
});

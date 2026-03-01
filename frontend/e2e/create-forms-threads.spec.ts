import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import path from "path";

/** When set (e.g. E2E_MANUAL_MEDIA=1), tests click the Add media zone and wait 5s for you to select a file. */
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

/** Build a thread of 3 tweets (threaded to one another). Optionally add image to first and video to second; third is text-only. */
async function buildThreadOfThree(
  page: import("@playwright/test").Page,
  options: {
    addImageAndVideo?: boolean; // when true (and not useManualMedia), add image to post 0, video to post 1
  } = {},
) {
  const { addImageAndVideo = true } = options;

  const accountToggleBtn = page.getByRole("button", {
    name: /Select all|Deselect all/,
  });
  await expect(accountToggleBtn).toBeVisible({ timeout: 10000 });
  if ((await accountToggleBtn.textContent())?.trim() === "Select all") {
    await accountToggleBtn.click();
  }

  const textareas = page.locator('textarea[placeholder="What\'s happening?"]');
  await expect(textareas.first()).toBeVisible({ timeout: 5000 });

  const uniquePrefix = "Thread " + Date.now() + " ";
  await textareas.nth(0).fill(uniquePrefix + "First tweet.");
  await page.getByRole("button", { name: "Add another post" }).click();
  await expect(textareas.nth(1)).toBeVisible({ timeout: 5000 });
  await textareas.nth(1).fill(uniquePrefix + "Second tweet.");
  await page.getByRole("button", { name: "Add another post" }).click();
  await expect(textareas.nth(2)).toBeVisible({ timeout: 5000 });
  await textareas.nth(2).fill(uniquePrefix + "Third tweet.");

  if (addImageAndVideo && !useManualMedia) {
    const fileInputs = page.locator(
      'input[type="file"][accept="image/*,video/*"]',
    );
    const imagePath = path.join(__dirname, "../fixtures/test-image.jpg");
    const videoPath = path.join(__dirname, "../fixtures/test-video.mp4");
    await expect(fileInputs.nth(0)).toBeAttached({ timeout: 5000 });
    await fileInputs.nth(0).setInputFiles(imagePath);
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(fileInputs.nth(1)).toBeAttached({ timeout: 5000 });
    await fileInputs.nth(1).setInputFiles(videoPath);
    await expect(page.locator('video[src^="blob:"]').first()).toBeVisible({
      timeout: 15000,
    });
  } else if (addImageAndVideo && useManualMedia) {
    const addMediaLabels = page.getByRole("label").filter({
      hasText: /Add media/,
    });
    await addMediaLabels.nth(0).click();
    await page.waitForTimeout(3000);
    await addMediaLabels.nth(1).click();
    await page.waitForTimeout(5000);
  }

  return { uniquePrefix };
}

test.describe("Create forms – ThreadsPostForm", () => {
  test("threads post form loads with thread posts, Post now, and Save to Drafts", async ({
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

    await expect(
      page.getByRole("button", { name: "Post now" }),
    ).toBeVisible({ timeout: 5000 });
    const saveDraftBtn = page
      .getByRole("button", { name: /save.*draft/i, exact: false })
      .first();
    await expect(saveDraftBtn).toBeVisible({ timeout: 5000 });
  });

  test("Save to Drafts – thread of 3 tweets (threaded), saves draft, redirects to drafts", async ({
    page,
  }) => {
    test.setTimeout(useManualMedia ? 90000 : 55000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/threads");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/threads/);

    const { uniquePrefix } = await buildThreadOfThree(page);

    const saveDraftBtn = page
      .getByRole("button", { name: /save.*draft/i, exact: false })
      .first();
    await expect(saveDraftBtn).toBeVisible({ timeout: 5000 });
    await saveDraftBtn.click();

    await page.waitForURL(
      /\/(dashboard\/posts\/drafts|dashboard\/posts)(?:\/|$)/,
      { timeout: 30000 },
    );
    await page.waitForLoadState("networkidle");
    if (
      page.url().includes("/dashboard/posts") &&
      !page.url().includes("/drafts")
    ) {
      await page.goto("/dashboard/posts/drafts");
      await page.waitForLoadState("networkidle");
    }

    await expect(page.getByText(uniquePrefix)).toBeVisible({
      timeout: 10000,
    });
  });

  test("Post now – thread of 3 tweets (threaded), clicks Post now, redirects to posts", async ({
    page,
  }) => {
    test.setTimeout(useManualMedia ? 90000 : 60000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/threads");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/threads/);

    await buildThreadOfThree(page);

    const postNowBtn = page.getByRole("button", { name: "Post now" }).first();
    await expect(postNowBtn).toBeVisible({ timeout: 5000 });
    await postNowBtn.click();

    await page.waitForURL(/\/dashboard\/posts(?:\/|$)/, { timeout: 35000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/posts/);
  });

  test("Schedule – thread of 3 tweets (threaded), enables schedule, sets future time, schedules", async ({
    page,
  }) => {
    test.setTimeout(useManualMedia ? 95000 : 65000);
    await loginAsTestUser(page);
    await page.goto("/dashboard/create/threads");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/create\/threads/);

    await buildThreadOfThree(page);

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
      timeout: 30000,
    });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/posts\/scheduled/);
  });
});

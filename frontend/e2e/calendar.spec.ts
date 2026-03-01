import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test.describe("Calendar", () => {
  test("navigate calendar, month/week, nav arrows", async ({ page }) => {
    test.setTimeout(45000);

    await loginAsTestUser(page);
    await page.goto("/dashboard/calendar");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/calendar/);

    // Current month name should be visible in the header (format: "MMMM yyyy")
    const monthName = new Date().toLocaleString("default", { month: "long" });
    await expect(page.getByText(monthName).first()).toBeVisible({
      timeout: 10000,
    });

    // View toggle buttons exist
    await expect(page.getByRole("button", { name: "Month", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Week" })).toBeVisible();

    // Navigation arrows (aria-label set by the component)
    const prevButton = page.getByRole("button", { name: "Previous month" });
    const nextButton = page.getByRole("button", { name: "Next month" });
    await expect(prevButton).toBeVisible();
    await expect(nextButton).toBeVisible();

    // Click next month and verify we're still on the calendar
    await nextButton.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/calendar/);

    // Click back to current month
    await prevButton.click();
    await page.waitForLoadState("networkidle");

    // Switch to week view
    await page.getByRole("button", { name: "Week" }).click();
    await page.waitForLoadState("networkidle");
    // Header should now contain "Week of ..."
    await expect(page.getByText(/Week of/)).toBeVisible({ timeout: 5000 });

    // Week view prev/next arrows have different aria-labels
    await expect(
      page.getByRole("button", { name: "Previous week" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next week" }),
    ).toBeVisible();

    // Switch back to month view
    await page.getByRole("button", { name: "Month" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(monthName).first()).toBeVisible({
      timeout: 5000,
    });
  });
});

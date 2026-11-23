/**
 * List endpoints ran count(*) on every page. A page that came back partly
 * full already says how many rows there are, so the count only runs when it
 * cannot be known from the page.
 */
import { describe, expect, it, vi } from "vitest";
import { listTotal } from "../lib/list-total.js";

describe("listTotal", () => {
  it("knows the total from a partly full page without counting", async () => {
    const count = vi.fn(async () => 999);
    expect(await listTotal(0, 20, 7, count)).toBe(7);
    expect(await listTotal(40, 20, 3, count)).toBe(43);
    expect(await listTotal(0, 20, 0, count)).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });

  it("counts when the page is full (there may be more)", async () => {
    const count = vi.fn(async () => 57);
    expect(await listTotal(20, 20, 20, count)).toBe(57);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("counts when the caller paged past the end", async () => {
    const count = vi.fn(async () => 12);
    expect(await listTotal(100, 20, 0, count)).toBe(12);
    expect(count).toHaveBeenCalledTimes(1);
  });
});

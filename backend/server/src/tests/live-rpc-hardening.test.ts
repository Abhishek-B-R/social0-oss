import { describe, expect, it, vi } from "vitest";
import {
  createLiveRequestBudget,
  raceTimeout,
} from "../lib/live-request-budget.js";
import { mapPool } from "../lib/map-pool.js";

describe("live-request-budget", () => {
  it("expires after the configured window", () => {
    vi.useFakeTimers();
    const budget = createLiveRequestBudget(1_000);
    expect(budget.isExpired()).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(budget.isExpired()).toBe(true);
    expect(budget.remainingMs()).toBe(0);
    vi.useRealTimers();
  });

  it("raceTimeout rejects slow promises", async () => {
    await expect(
      raceTimeout(
        new Promise((resolve) => setTimeout(() => resolve("late"), 50)),
        10,
        "slow",
      ),
    ).rejects.toThrow(/slow timed out/);
  });

  it("raceTimeout resolves fast promises", async () => {
    await expect(
      raceTimeout(Promise.resolve("ok"), 100, "fast"),
    ).resolves.toBe("ok");
  });
});

describe("mapPool budget skip", () => {
  it("skips remaining items when shouldContinue flips false", async () => {
    let claimed = 0;
    const results = await mapPool(
      [1, 2, 3, 4, 5],
      2,
      async (n) => {
        claimed += 1;
        await new Promise((r) => setTimeout(r, 5));
        return n * 10;
      },
      {
        shouldContinue: () => claimed < 2,
        onSkip: (n) => n * -1,
      },
    );
    expect(results.filter((r) => r > 0).length).toBeLessThanOrEqual(2);
    expect(results.some((r) => r < 0)).toBe(true);
    expect(results).toHaveLength(5);
  });
});

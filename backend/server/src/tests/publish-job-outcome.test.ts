import { describe, it, expect } from "vitest";
import { publishJobOutcome } from "@social0/shared";

describe("publishJobOutcome", () => {
  it("stays processing until every platform has reported", () => {
    expect(publishJobOutcome(0, 0, 2).allDone).toBe(false);
    expect(publishJobOutcome(1, 0, 2).allDone).toBe(false);
    expect(publishJobOutcome(0, 0, 2).status).toBe("processing");
  });

  it("a job with no targets never completes", () => {
    expect(publishJobOutcome(0, 0, 0).allDone).toBe(false);
    expect(publishJobOutcome(0, 0, 0).status).toBe("processing");
  });

  it("reports failure when nothing published", () => {
    const one = publishJobOutcome(0, 1, 1);
    expect(one.status).toBe("failed");
    expect(one.message).toBe("Publish finished with failures");
    expect(publishJobOutcome(0, 3, 3).status).toBe("failed");
  });

  it("reports a partial publish with its counts", () => {
    const partial = publishJobOutcome(2, 1, 3);
    expect(partial.status).toBe("completed");
    expect(partial.message).toBe("Published to 2/3 platforms (1 failed)");
  });

  it("reports a clean run", () => {
    const clean = publishJobOutcome(3, 0, 3);
    expect(clean.status).toBe("completed");
    expect(clean.message).toBe("All platforms published");
  });

  /**
   * The regression this rule exists for: the counters used to be incremented
   * by two writers, so a single failed platform arrived as failed=2/total=1.
   * `failed === total` was false there and the job claimed success.
   */
  it("still calls an all-failed job failed when the counts overshoot", () => {
    const overshoot = publishJobOutcome(0, 2, 1);
    expect(overshoot.allDone).toBe(true);
    expect(overshoot.status).toBe("failed");
    expect(overshoot.message).toBe("Publish finished with failures");
  });

  it("still calls a clean run successful when the counts overshoot", () => {
    const overshoot = publishJobOutcome(2, 0, 1);
    expect(overshoot.status).toBe("completed");
    expect(overshoot.message).toBe("All platforms published");
  });
});

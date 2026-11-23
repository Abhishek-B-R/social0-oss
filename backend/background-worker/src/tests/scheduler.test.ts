import { beforeEach, describe, expect, it, vi } from "vitest";

const { runners } = vi.hoisted(() => ({
  runners: {
    publish: vi.fn(),
    repost: vi.fn(),
    autoplug: vi.fn(),
    zombie: vi.fn(),
  },
}));

vi.mock("../cron/publish-scheduled.js", () => ({
  runPublishScheduledCron: runners.publish,
}));
vi.mock("../cron/repost-run.js", () => ({ runRepostCron: runners.repost }));
vi.mock("../cron/autoplug-run.js", () => ({ runAutoplugCron: runners.autoplug }));
vi.mock("../cron/billing-zombie-run.js", () => ({
  runBillingZombieCleanup: runners.zombie,
}));

import { JOB_NAMES } from "@social0/shared";
import {
  SCHEDULER_CONCURRENCY,
  processSchedulerJob,
} from "../workers/scheduler.js";

beforeEach(() => {
  for (const run of Object.values(runners)) {
    run.mockReset();
    run.mockResolvedValue({ ok: true });
  }
});

describe("scheduler worker", () => {
  it("has a slot for every cron", () => {
    expect(SCHEDULER_CONCURRENCY).toBe(4);
  });

  /**
   * With one slot shared by every cron, a stalled autoplug run held
   * publish-scheduled behind it: no scheduled post went out until it ended.
   */
  it("runs publish-scheduled while autoplug is still running", async () => {
    let finishAutoplug!: () => void;
    runners.autoplug.mockReturnValue(
      new Promise((resolve) => {
        finishAutoplug = () => resolve({ ok: true });
      }),
    );

    const autoplug = processSchedulerJob(JOB_NAMES.CRON_AUTOPLUG);
    await expect(processSchedulerJob(JOB_NAMES.CRON_PUBLISH_SCHEDULED)).resolves.toEqual({
      ok: true,
    });
    expect(runners.publish).toHaveBeenCalledTimes(1);

    finishAutoplug();
    await autoplug;
  });

  it("does not run the same cron twice at once", async () => {
    let finish!: () => void;
    runners.publish.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ ok: true });
      }),
    );

    const first = processSchedulerJob(JOB_NAMES.CRON_PUBLISH_SCHEDULED);
    await expect(processSchedulerJob(JOB_NAMES.CRON_PUBLISH_SCHEDULED)).resolves.toEqual({
      ok: true,
      skipped: "already_running",
    });
    expect(runners.publish).toHaveBeenCalledTimes(1);

    finish();
    await first;
    // Free again once the first run is done.
    await processSchedulerJob(JOB_NAMES.CRON_PUBLISH_SCHEDULED);
    expect(runners.publish).toHaveBeenCalledTimes(2);
  });

  it("frees the cron after a run that throws", async () => {
    runners.repost.mockRejectedValueOnce(new Error("boom"));
    await expect(processSchedulerJob(JOB_NAMES.CRON_REPOST)).rejects.toThrow("boom");
    await processSchedulerJob(JOB_NAMES.CRON_REPOST);
    expect(runners.repost).toHaveBeenCalledTimes(2);
  });

  it("reports an unknown job", async () => {
    await expect(processSchedulerJob("cron.nope")).resolves.toEqual({
      ok: false,
      error: "unknown_job",
    });
  });
});

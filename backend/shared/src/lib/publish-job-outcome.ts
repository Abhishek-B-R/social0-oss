export type PublishJobStatus = "processing" | "completed" | "failed";

export type PublishJobOutcome = {
  allDone: boolean;
  status: PublishJobStatus;
  /** Terminal event message; only meaningful when `allDone`. */
  message: string;
};

/**
 * Decide how a publish job reads once a platform has reported in.
 *
 * `completed` and `failed` must be counted from `post_publications`, not
 * accumulated on `publish_jobs`. Incrementing double-counted whenever a second
 * writer touched the same job (the progress store's persist hooks on the API)
 * or the same platform job ran twice (a BullMQ or Cloudflare Queue retry), and
 * the old `failed === total` test then read false — so a publish where every
 * platform failed recorded itself as "completed / All platforms published".
 * Deciding on `completed === 0` says the same thing for exact counts and stays
 * right when the counts drift.
 *
 * Shared so the API and the Cloudflare publish worker, which write the same
 * rows for the same progress UI, cannot disagree about what a job outcome is.
 */
export function publishJobOutcome(
  completed: number,
  failed: number,
  total: number,
): PublishJobOutcome {
  const allDone = total > 0 && completed + failed >= total;
  if (!allDone) {
    return { allDone: false, status: "processing", message: "" };
  }
  if (completed === 0) {
    return {
      allDone: true,
      status: "failed",
      message: "Publish finished with failures",
    };
  }
  if (failed > 0) {
    return {
      allDone: true,
      status: "completed",
      message: `Published to ${completed}/${total} platforms (${failed} failed)`,
    };
  }
  return {
    allDone: true,
    status: "completed",
    message: "All platforms published",
  };
}

import type { PublishPlatformJob } from "./types";

/** Write SSE events directly to Postgres (API streams DB changes). */
export async function trackPlatformPhase(
  env: Env,
  job: PublishPlatformJob,
  phase: string,
  message: string,
): Promise<void> {
  if (!job.trackingId) return;

  const { default: postgres } = await import("postgres");
  const sql = postgres(env.HYPERDRIVE.connectionString, {
    max: 1,
    fetch_types: false,
  });

  try {
    await sql`
      INSERT INTO publish_job_events (
        tracking_id, post_id, user_id, phase, platform,
        connected_account_id, message
      ) VALUES (
        ${job.trackingId},
        ${job.postId}::uuid,
        ${job.userId},
        ${phase},
        ${job.platform},
        ${job.connectedAccountId}::uuid,
        ${message}
      )
    `;

    await sql`
      UPDATE publish_jobs
      SET status = 'processing', updated_at = NOW()
      WHERE tracking_id = ${job.trackingId}
    `;
  } finally {
    await sql.end({ timeout: 0 });
  }
}

/** Increment platform counters and emit terminal completed/failed when all platforms finish. */
export async function recordPlatformResult(
  env: Env,
  job: PublishPlatformJob,
  success: boolean,
  message: string,
): Promise<void> {
  if (!job.trackingId) return;

  const { default: postgres } = await import("postgres");
  const sql = postgres(env.HYPERDRIVE.connectionString, {
    max: 1,
    fetch_types: false,
  });

  try {
    const [row] = await sql<
      { total: number; completed: number; failed: number }[]
    >`
      SELECT total, completed, failed
      FROM publish_jobs
      WHERE tracking_id = ${job.trackingId}
      LIMIT 1
    `;

    if (!row) return;

    const completed = row.completed + (success ? 1 : 0);
    const failed = row.failed + (success ? 0 : 1);
    const total = row.total;
    const progress = { completed, failed, total };
    const phase = success ? "platform_success" : "platform_failed";

    await sql`
      INSERT INTO publish_job_events (
        tracking_id, post_id, user_id, phase, platform,
        connected_account_id, message, progress
      ) VALUES (
        ${job.trackingId},
        ${job.postId}::uuid,
        ${job.userId},
        ${phase},
        ${job.platform},
        ${job.connectedAccountId}::uuid,
        ${message},
        ${JSON.stringify(progress)}::jsonb
      )
    `;

    const allDone = completed + failed >= total && total > 0;
    const status = allDone
      ? failed === total
        ? "failed"
        : "completed"
      : "processing";

    await sql`
      UPDATE publish_jobs
      SET
        status = ${status},
        completed = ${completed},
        failed = ${failed},
        updated_at = NOW()
      WHERE tracking_id = ${job.trackingId}
    `;

    if (allDone) {
      await sql`
        INSERT INTO publish_job_events (
          tracking_id, post_id, user_id, phase, message, progress
        ) VALUES (
          ${job.trackingId},
          ${job.postId}::uuid,
          ${job.userId},
          ${status},
          ${status === "completed" ? "All platforms published" : "Publish finished with failures"},
          ${JSON.stringify(progress)}::jsonb
        )
      `;
    }
  } finally {
    await sql.end({ timeout: 0 });
  }
}

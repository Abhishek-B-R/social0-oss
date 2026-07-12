import type { PublishPlatformJob } from "./types";
import { assertPublishJobAuthorized } from "./validate-job";

/** Write SSE events directly to Postgres (API streams DB changes). */
export async function trackPlatformPhase(
  env: Env,
  job: PublishPlatformJob,
  phase: string,
  message: string,
  opts?: { skipAuth?: boolean },
): Promise<void> {
  if (!job.trackingId) return;
  if (!opts?.skipAuth && (await assertPublishJobAuthorized(env, job))) return;

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
  opts?: { skipAuth?: boolean },
): Promise<void> {
  if (!opts?.skipAuth && (await assertPublishJobAuthorized(env, job))) return;

  const { default: postgres } = await import("postgres");
  const sql = postgres(env.HYPERDRIVE.connectionString, {
    max: 1,
    fetch_types: false,
  });

  try {
    if (!success) {
      await sql`
        UPDATE post_publications
        SET status = 'failed', last_error = ${message}, updated_at = NOW()
        WHERE id = ${job.publicationId}::uuid
      `;
    }

    const [pubCounts] = await sql<
      { total: number; published: number; failed: number }[]
    >`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM post_publications
      WHERE post_id = ${job.postId}::uuid
    `;

    if (
      pubCounts &&
      pubCounts.total > 0 &&
      pubCounts.published + pubCounts.failed >= pubCounts.total
    ) {
      const postStatus =
        pubCounts.published === 0
          ? "failed"
          : pubCounts.failed === 0
            ? "published"
            : "partial";

      let failureReason: string | null = null;
      if (pubCounts.failed > 0) {
        const [failedRow] = await sql<{ last_error: string | null }[]>`
          SELECT last_error
          FROM post_publications
          WHERE post_id = ${job.postId}::uuid
            AND status = 'failed'
            AND last_error IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 1
        `;
        failureReason = failedRow?.last_error?.trim() || message;
      }

      await sql`
        UPDATE posts
        SET
          status = ${postStatus},
          failure_reason = ${failureReason},
          updated_at = NOW()
        WHERE id = ${job.postId}::uuid
      `;
    }

    if (!job.trackingId) return;

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
          ${
            failed === total
              ? "Publish finished with failures"
              : completed > 0 && failed > 0
                ? `Published to ${completed}/${total} platforms (${failed} failed)`
                : "All platforms published"
          },
          ${JSON.stringify(progress)}::jsonb
        )
      `;
    }
  } finally {
    await sql.end({ timeout: 0 });
  }
}

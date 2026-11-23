import { publishJobOutcome } from "@social0/shared";
import type { PublishPlatformJob } from "./types";
import { assertPublishJobAuthorized } from "./validate-job";
import { withSql, type Sql } from "./db";

/** Write SSE events directly to Postgres (API streams DB changes). */
export async function trackPlatformPhase(
  env: Env,
  job: PublishPlatformJob,
  phase: string,
  message: string,
  opts?: { skipAuth?: boolean; sql?: Sql },
): Promise<void> {
  const trackingId = job.trackingId;
  if (!trackingId) return;
  if (!opts?.skipAuth && (await assertPublishJobAuthorized(env, job, opts?.sql))) return;

  await withSql(env, opts?.sql, async (sql) => {
    await sql`
      INSERT INTO publish_job_events (
        tracking_id, post_id, user_id, phase, platform,
        connected_account_id, message
      ) VALUES (
        ${trackingId},
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
      WHERE tracking_id = ${trackingId}
    `;
  });
}

/** Increment platform counters and emit terminal completed/failed when all platforms finish. */
export async function recordPlatformResult(
  env: Env,
  job: PublishPlatformJob,
  success: boolean,
  message: string,
  opts?: { skipAuth?: boolean; sql?: Sql },
): Promise<void> {
  if (!opts?.skipAuth && (await assertPublishJobAuthorized(env, job, opts?.sql))) return;

  await withSql(env, opts?.sql, async (sql) => {
    if (!success) {
      // Only a delivery nobody is working on can be marked failed here. A
      // "publishing" row belongs to a live run (possibly another one: a
      // redelivered message, Publish now racing the cron) and a "published"
      // row is done; that run records its own outcome. Demoting either failed
      // a post mid-upload and invited a Retry that posted it twice.
      const demoted = await sql`
        UPDATE post_publications
        SET status = 'failed', last_error = ${message}, updated_at = NOW()
        WHERE id = ${job.publicationId}::uuid
          AND (status IS NULL OR status IN ('pending', 'failed'))
        RETURNING id
      `;
      if (demoted.length === 0) {
        const [current] = await sql<{ status: string | null }[]>`
          SELECT status
          FROM post_publications
          WHERE id = ${job.publicationId}::uuid
          LIMIT 1
        `;
        if (current?.status === "publishing") return;
      }
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

    const [row] = await sql<{ total: number }[]>`
      SELECT total
      FROM publish_jobs
      WHERE tracking_id = ${job.trackingId}
      LIMIT 1
    `;

    if (!row) return;

    // Count the publications rather than incrementing the stored counters.
    // A queue retry of the same platform message incremented a second time,
    // and `failed === total` then read false — so a publish where every
    // platform failed recorded itself as "completed / All platforms
    // published". The publication rows are the source of truth and are already
    // updated above, so deriving from them is idempotent.
    const completed = pubCounts?.published ?? 0;
    const failed = pubCounts?.failed ?? 0;
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

    const outcome = publishJobOutcome(completed, failed, total);

    await sql`
      UPDATE publish_jobs
      SET
        status = ${outcome.status},
        completed = ${completed},
        failed = ${failed},
        updated_at = NOW()
      WHERE tracking_id = ${job.trackingId}
    `;

    if (outcome.allDone) {
      await sql`
        INSERT INTO publish_job_events (
          tracking_id, post_id, user_id, phase, message, progress
        ) VALUES (
          ${job.trackingId},
          ${job.postId}::uuid,
          ${job.userId},
          ${outcome.status},
          ${outcome.message},
          ${JSON.stringify(progress)}::jsonb
        )
      `;
    }
  });
}

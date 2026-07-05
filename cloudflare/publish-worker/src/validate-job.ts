import { SUPPORTED_PLATFORMS } from "@social0/shared";
import type { PublishPlatformJob } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const platformSet = new Set<string>(SUPPORTED_PLATFORMS);

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function parsePublishPlatformJob(
  raw: Record<string, unknown>,
): PublishPlatformJob | null {
  const {
    postId,
    userId,
    publicationId,
    connectedAccountId,
    platform,
    trackingId,
  } = raw;

  if (
    typeof postId !== "string" ||
    typeof userId !== "string" ||
    typeof publicationId !== "string" ||
    typeof connectedAccountId !== "string" ||
    typeof platform !== "string"
  ) {
    return null;
  }

  if (
    !isValidUuid(postId) ||
    !isValidUuid(publicationId) ||
    !isValidUuid(connectedAccountId)
  ) {
    return null;
  }

  if (!platformSet.has(platform)) return null;

  if (trackingId !== undefined && trackingId !== null) {
    if (typeof trackingId !== "string" || !isValidUuid(trackingId)) {
      return null;
    }
  }

  return {
    postId,
    userId,
    publicationId,
    connectedAccountId,
    platform: platform as PublishPlatformJob["platform"],
    ...(typeof trackingId === "string" ? { trackingId } : {}),
  };
}

/** Verify the job matches real DB rows before queueing or writing progress. */
export async function assertPublishJobAuthorized(
  env: Env,
  job: PublishPlatformJob,
): Promise<string | null> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(env.HYPERDRIVE.connectionString, {
    max: 1,
    fetch_types: false,
  });

  try {
    const [row] = await sql<{ ok: number }[]>`
      SELECT 1 AS ok
      FROM posts p
      INNER JOIN post_publications pp ON pp.post_id = p.id
      INNER JOIN connected_accounts ca ON ca.id = pp.connected_account_id
      WHERE p.id = ${job.postId}::uuid
        AND p.user_id = ${job.userId}
        AND pp.id = ${job.publicationId}::uuid
        AND ca.id = ${job.connectedAccountId}::uuid
        AND ca.user_id = ${job.userId}
      LIMIT 1
    `;

    if (!row) return "Publication not found for user";

    if (job.trackingId) {
      const [tracking] = await sql<{ ok: number }[]>`
        SELECT 1 AS ok
        FROM publish_jobs
        WHERE tracking_id = ${job.trackingId}
          AND post_id = ${job.postId}::uuid
          AND user_id = ${job.userId}
        LIMIT 1
      `;
      if (!tracking) return "Invalid tracking job";
    }

    return null;
  } finally {
    await sql.end({ timeout: 0 });
  }
}

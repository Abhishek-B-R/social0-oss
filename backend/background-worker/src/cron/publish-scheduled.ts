import { and, eq, lt, lte } from "drizzle-orm";
import {
  SERVER_SIDE_PUBLISH_PLATFORMS,
  cfEnqueuePlatformJob,
  cfPublishClientFromEnv,
  type PublishPlatformJob,
} from "@social0/shared";
import { db } from "../db/index.js";
import { posts, queuedPosts } from "../db/schema.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";

function apiBaseUrl(): string {
  const raw =
    process.env.AUTH_API_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "https://api.social0.app";
  try {
    const host = new URL(raw).hostname;
    if (host.endsWith(".social0.app") && host !== "api.social0.app") {
      return "https://api.social0.app";
    }
  } catch {
    return "https://api.social0.app";
  }
  return raw.replace(/\/$/, "");
}

/**
 * X/Twitter must run on the API VM (not CF) for any Node-only leftovers.
 * Hit the API cron endpoint — same execution path as immediate enqueue.
 */
async function enqueueServerSidePlatformJob(
  job: PublishPlatformJob,
): Promise<void> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("CRON_SECRET is required to publish Twitter on the API");
  }
  const res = await fetch(`${apiBaseUrl()}/api/cron/publish-platform`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(job),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `API publish-platform failed: ${res.status} ${text.slice(0, 200)}`,
    );
  }
}

async function enqueueTarget(
  job: PublishPlatformJob,
  cfClient: NonNullable<ReturnType<typeof cfPublishClientFromEnv>>,
): Promise<void> {
  if (SERVER_SIDE_PUBLISH_PLATFORMS.has(job.platform)) {
    await enqueueServerSidePlatformJob(job);
    return;
  }
  await cfEnqueuePlatformJob(job, "scheduled", cfClient);
}

/** Scan DB for due scheduled posts and fan out to Cloudflare publish queues. */
export async function runPublishScheduledCron(): Promise<{
  processed: string[];
  queuedProcessed: string[];
}> {
  const cfClient = cfPublishClientFromEnv();
  if (!cfClient) {
    throw new Error(
      "CF publish is not configured (set CF_PUBLISH_WORKER_URL + CF_PUBLISH_HMAC_SECRET)",
    );
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await db
    .update(posts)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(posts.status, "publishing"), lt(posts.updatedAt, oneHourAgo)));

  const now = new Date();
  const due = await db
    .select({ id: posts.id, userId: posts.userId })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, now)));

  const processed: string[] = [];

  for (const post of due) {
    const [claimed] = await db
      .update(posts)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(
        and(
          eq(posts.id, post.id),
          eq(posts.userId, post.userId),
          eq(posts.status, "scheduled"),
        ),
      )
      .returning({ id: posts.id });
    if (!claimed) continue;

    const targets = await loadPublicationTargets({
      postId: post.id,
      userId: post.userId,
    });
    if (targets.length === 0) {
      await db
        .update(posts)
        .set({ status: "failed", updatedAt: new Date() })
        .where(and(eq(posts.id, post.id), eq(posts.userId, post.userId)));
      continue;
    }
    for (const t of targets) {
      await enqueueTarget(
        {
          postId: post.id,
          userId: post.userId,
          publicationId: t.publicationId,
          connectedAccountId: t.connectedAccountId,
          platform: t.platform,
        },
        cfClient,
      );
    }
    processed.push(post.id);
  }

  const dueQueued = await db
    .select({
      id: queuedPosts.id,
      postId: queuedPosts.postId,
      userId: queuedPosts.userId,
    })
    .from(queuedPosts)
    .where(
      and(eq(queuedPosts.status, "pending"), lte(queuedPosts.scheduledFor, now)),
    );

  const queuedProcessed: string[] = [];
  for (const q of dueQueued) {
    const [claimed] = await db
      .update(queuedPosts)
      .set({ status: "processing" })
      .where(
        and(eq(queuedPosts.id, q.id), eq(queuedPosts.status, "pending")),
      )
      .returning({ id: queuedPosts.id });
    if (!claimed) continue;

    const targets = await loadPublicationTargets({
      postId: q.postId,
      userId: q.userId,
    });
    if (targets.length === 0) {
      await db
        .update(queuedPosts)
        .set({ status: "failed" })
        .where(eq(queuedPosts.id, q.id));
      continue;
    }
    for (const t of targets) {
      await enqueueTarget(
        {
          postId: q.postId,
          userId: q.userId,
          publicationId: t.publicationId,
          connectedAccountId: t.connectedAccountId,
          platform: t.platform,
        },
        cfClient,
      );
    }
    queuedProcessed.push(q.postId);
  }

  return { processed, queuedProcessed };
}

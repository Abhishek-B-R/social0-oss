import { and, eq, inArray } from "drizzle-orm";
import type { PublishPostJob, SupportedPlatform } from "@social0/shared";
import { db } from "../db/index.js";
import {
  connectedAccounts,
  postPublications,
  posts,
} from "../db/schema.js";

const ACTIVE_PUBLICATION_STATUSES = ["pending", "publishing"] as const;

export async function loadPublicationTargets(job: PublishPostJob): Promise<
  Array<{
    publicationId: string;
    connectedAccountId: string;
    platform: SupportedPlatform;
  }>
> {
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, job.postId), eq(posts.userId, job.userId)))
    .limit(1);

  if (!post) {
    console.warn(
      `[worker] loadPublicationTargets — post not found postId=${job.postId}`,
    );
    return [];
  }

  const accountFilter = job.connectedAccountIds?.length
    ? inArray(connectedAccounts.id, job.connectedAccountIds)
    : undefined;

  const rows = await db
    .select({
      publicationId: postPublications.id,
      connectedAccountId: postPublications.connectedAccountId,
      platform: connectedAccounts.platform,
      status: postPublications.status,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        eq(postPublications.postId, job.postId),
        inArray(postPublications.status, [...ACTIVE_PUBLICATION_STATUSES]),
        accountFilter,
      ),
    );

  return rows
    .filter((r) => r.connectedAccountId && r.platform)
    .map((r) => ({
      publicationId: r.publicationId,
      connectedAccountId: r.connectedAccountId!,
      platform: r.platform as SupportedPlatform,
    }));
}

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  postPublications,
  publishAttempts,
  publishFailures,
} from "../db/schema.js";
import type { SupportedPlatform } from "@social0/shared";

export async function isPublicationAlreadyPublished(
  publicationId: string,
): Promise<boolean> {
  const pub = await db.query.postPublications.findFirst({
    where: eq(postPublications.id, publicationId),
    columns: { status: true, platformPostId: true },
  });
  return pub?.status === "published" && Boolean(pub.platformPostId);
}

export async function recordPublishAttempt(input: {
  publicationId: string;
  postId: string;
  userId: string;
  platform: SupportedPlatform;
  connectedAccountId: string;
  jobId?: string;
  attempt: number;
  status: "started" | "succeeded" | "failed";
  platformPostId?: string;
  error?: string;
}) {
  await db.insert(publishAttempts).values({
    publicationId: input.publicationId,
    postId: input.postId,
    userId: input.userId,
    platform: input.platform,
    connectedAccountId: input.connectedAccountId,
    jobId: input.jobId ?? null,
    attempt: input.attempt,
    status: input.status,
    platformPostId: input.platformPostId ?? null,
    error: input.error ?? null,
  });
}

export async function recordPublishFailure(input: {
  publicationId: string;
  postId: string;
  userId: string;
  platform: SupportedPlatform;
  connectedAccountId: string;
  error: string;
  jobId?: string;
  attempts: number;
}) {
  await db.insert(publishFailures).values({
    publicationId: input.publicationId,
    postId: input.postId,
    userId: input.userId,
    platform: input.platform,
    connectedAccountId: input.connectedAccountId,
    error: input.error,
    jobId: input.jobId ?? null,
    attempts: input.attempts,
  });
}

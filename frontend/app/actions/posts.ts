"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
} from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { executePublish } from "@/app/actions/publish";

export type CreatePostResult =
  | { success: true; postId: string }
  | { success: false; error: string };

export type PublishMode = "draft" | "now" | "scheduled";

export async function createPost(
  content: string,
  selectedAccountIds: string[],
  mode: PublishMode,
  scheduledAt: Date | null,
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
): Promise<CreatePostResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, error: "Post content is required" };
  }

  if (selectedAccountIds.length === 0) {
    return {
      success: false,
      error: "Select at least one account to publish to",
    };
  }

  // Validate UUIDs
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !selectedAccountIds.every((id) => uuidRegex.test(id)) ||
    !mediaIds.every((id) => uuidRegex.test(id))
  ) {
    return {
      success: false,
      error: "Invalid ID format",
    };
  }

  if (mode === "scheduled" && !scheduledAt) {
    return { success: false, error: "Please pick a date and time to schedule" };
  }

  // Ensure all selected accounts belong to the current user
  const ownedAccounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, session.user.id),
        inArray(connectedAccounts.id, selectedAccountIds),
      ),
    );
  const ownedAccountIds = new Set(ownedAccounts.map((a) => a.id));
  const validSelectedIds = [...new Set(selectedAccountIds)];
  if (
    validSelectedIds.length !== ownedAccountIds.size ||
    !validSelectedIds.every((id) => ownedAccountIds.has(id))
  ) {
    return {
      success: false,
      error: "One or more selected accounts are invalid or do not belong to you",
    };
  }

  // Ensure all media IDs belong to the current user (when provided)
  if (mediaIds.length > 0) {
    const ownedMedia = await db
      .select({ id: mediaUploads.id })
      .from(mediaUploads)
      .where(
        and(
          eq(mediaUploads.userId, session.user.id),
          inArray(mediaUploads.id, mediaIds),
        ),
      );
    const ownedMediaIds = new Set(ownedMedia.map((m) => m.id));
    if (!mediaIds.every((id) => ownedMediaIds.has(id))) {
      return {
        success: false,
        error: "One or more media files are invalid or do not belong to you",
      };
    }
  }

  const status = mode === "draft" ? "draft" : "scheduled";
  const resolvedScheduledAt =
    mode === "now" ? new Date() : mode === "scheduled" ? scheduledAt : null;

  try {
    const [postRow] = await db
      .insert(posts)
      .values({
        userId: session.user.id,
        originalContent: trimmed,
        finalContent: trimmed,
        status,
        scheduledAt: resolvedScheduledAt,
        mediaIds: mediaIds.length > 0 ? mediaIds : [],
        metadata: metadata || null,
      })
      .returning({ id: posts.id });

    if (!postRow) {
      return { success: false, error: "Failed to create post" };
    }

    await db.insert(postPublications).values(
      validSelectedIds.map((connectedAccountId) => ({
        postId: postRow.id,
        connectedAccountId,
        status: "pending" as const,
      })),
    );

    if (mode === "now") {
      await executePublish(postRow.id, session.user.id);
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/posts");
    revalidatePath("/dashboard/posts/new");

    return { success: true, postId: postRow.id };
  } catch (e) {
    console.error("createPost error:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create post",
    };
  }
}

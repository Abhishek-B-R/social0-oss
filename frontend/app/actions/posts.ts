"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  posts,
  postPublications,
  connectedAccounts,
  mediaUploads,
  queuedPosts,
} from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { executePublish } from "@/app/actions/publish";
import {
  getPostForEdit,
  getPostMedia,
  type PostMediaRow,
} from "@/app/dashboard/posts/posts-list-data";
import { isValidUUID } from "@/lib/validation";

export type CreatePostResult =
  | { success: true; postId: string; allPlatformsFailed?: boolean }
  | { success: false; error: string };

export type PublishMode = "draft" | "now" | "scheduled";

export async function createPost(
  content: string,
  selectedAccountIds: string[],
  mode: PublishMode,
  scheduledAt: Date | null,
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
  queueSlotId?: string | null,
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

  if (
    !selectedAccountIds.every((id) => isValidUUID(id)) ||
    !mediaIds.every((id) => isValidUUID(id))
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
      error:
        "One or more selected accounts are invalid or do not belong to you",
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
      const publishResult = await executePublish(postRow.id, session.user.id);
      const succeededCount =
        publishResult.results?.filter((r) => r.status === "published")
          .length ?? 0;
      const allPlatformsFailed =
        (publishResult.results?.length ?? 0) > 0 && succeededCount === 0;

      revalidatePath("/dashboard");
      revalidatePath("/dashboard/posts");
      revalidatePath("/dashboard/create");

      return {
        success: true,
        postId: postRow.id,
        allPlatformsFailed: allPlatformsFailed || undefined,
      };
    }

    if (mode === "scheduled" && scheduledAt && queueSlotId?.trim()) {
      await db.insert(queuedPosts).values({
        userId: session.user.id,
        postId: postRow.id,
        slotId: queueSlotId.trim(),
        scheduledFor: scheduledAt,
        status: "pending",
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/posts");
    revalidatePath("/dashboard/posts/scheduled");
    revalidatePath("/dashboard/create");

    return { success: true, postId: postRow.id };
  } catch (e) {
    console.error("createPost error:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create post",
    };
  }
}

export type DeletePostResult =
  | { success: true }
  | { success: false; error: string };

export async function deletePost(postId: string): Promise<DeletePostResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }

  try {
    const [post] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, session.user.id)));
    if (!post) {
      return { success: false, error: "Post not found" };
    }

    await db
      .delete(postPublications)
      .where(eq(postPublications.postId, postId));
    await db.delete(posts).where(eq(posts.id, postId));

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/posts");
    revalidatePath("/dashboard/posts/scheduled");
    revalidatePath("/dashboard/posts/drafts");
    return { success: true };
  } catch (e) {
    console.error("deletePost error:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to delete post",
    };
  }
}

export type UpdatePostResult =
  | { success: true }
  | { success: false; error: string };

export async function updatePost(
  postId: string,
  content: string,
  selectedAccountIds: string[],
  scheduledAt: Date | null,
  mediaIds?: string[],
  metadata?: Record<string, unknown>,
  queueSlotId?: string | null,
): Promise<UpdatePostResult> {
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
      error: "Select at least one account",
    };
  }

  if (
    !isValidUUID(postId) ||
    !selectedAccountIds.every((id) => isValidUUID(id))
  ) {
    return { success: false, error: "Invalid ID format" };
  }

  const finalMediaIds = mediaIds ?? [];
  if (
    finalMediaIds.length > 0 &&
    !finalMediaIds.every((id) => isValidUUID(id))
  ) {
    return { success: false, error: "Invalid media ID format" };
  }

  const ownedAccounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, session.user.id),
        inArray(connectedAccounts.id, selectedAccountIds),
      ),
    );
  const ownedIds = new Set(ownedAccounts.map((a) => a.id));
  const validIds = [...new Set(selectedAccountIds)];
  if (
    validIds.length !== ownedIds.size ||
    !validIds.every((id) => ownedIds.has(id))
  ) {
    return {
      success: false,
      error: "One or more selected accounts are invalid",
    };
  }

  try {
    const [existing] = await db
      .select({ id: posts.id, status: posts.status, mediaIds: posts.mediaIds })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, session.user.id)));
    if (!existing) {
      return { success: false, error: "Post not found" };
    }
    if (existing.status !== "draft" && existing.status !== "scheduled") {
      return {
        success: false,
        error: "Only drafts and scheduled posts can be edited",
      };
    }

    if (finalMediaIds.length > 0) {
      const ownedMedia = await db
        .select({ id: mediaUploads.id })
        .from(mediaUploads)
        .where(
          and(
            eq(mediaUploads.userId, session.user.id),
            inArray(mediaUploads.id, finalMediaIds),
          ),
        );
      const ownedMediaIds = new Set(ownedMedia.map((m) => m.id));
      if (!finalMediaIds.every((id) => ownedMediaIds.has(id))) {
        return { success: false, error: "One or more media files are invalid" };
      }
    }

    const oldMediaIds = (existing.mediaIds ?? []) as string[];
    const status = scheduledAt ? "scheduled" : "draft";
    await db
      .update(posts)
      .set({
        originalContent: trimmed,
        finalContent: trimmed,
        status,
        scheduledAt,
        mediaIds: finalMediaIds,
        ...(metadata != null && { metadata }),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    const removedMediaIds = oldMediaIds.filter(
      (id) => !finalMediaIds.includes(id),
    );
    if (removedMediaIds.length > 0) {
      await db
        .delete(mediaUploads)
        .where(
          and(
            eq(mediaUploads.userId, session.user.id),
            inArray(mediaUploads.id, removedMediaIds),
          ),
        );
    }

    await db
      .delete(postPublications)
      .where(eq(postPublications.postId, postId));
    await db.insert(postPublications).values(
      validIds.map((connectedAccountId) => ({
        postId,
        connectedAccountId,
        status: "pending" as const,
      })),
    );

    if (scheduledAt && queueSlotId?.trim()) {
      await db
        .delete(queuedPosts)
        .where(
          and(
            eq(queuedPosts.postId, postId),
            eq(queuedPosts.userId, session.user.id),
          ),
        );
      await db.insert(queuedPosts).values({
        userId: session.user.id,
        postId,
        slotId: queueSlotId.trim(),
        scheduledFor: scheduledAt,
        status: "pending",
      });
    } else if (!scheduledAt) {
      await db
        .delete(queuedPosts)
        .where(
          and(
            eq(queuedPosts.postId, postId),
            eq(queuedPosts.userId, session.user.id),
          ),
        );
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/posts");
    revalidatePath("/dashboard/posts/scheduled");
    revalidatePath("/dashboard/posts/drafts");
    revalidatePath(`/dashboard/posts/${postId}/edit`);
    return { success: true };
  } catch (e) {
    console.error("updatePost error:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update post",
    };
  }
}

export type GetDraftResult =
  | {
      success: true;
      draft: {
        id: string;
        originalContent: string | null;
        scheduledAt: Date | null;
        connectedAccountIds: string[];
        media: PostMediaRow[];
        metadata: Record<string, unknown> | null;
      };
    }
  | { success: false; error: string };

export async function getDraft(postId: string): Promise<GetDraftResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }
  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }
  const post = await getPostForEdit(postId, session.user.id);
  if (!post) {
    return { success: false, error: "Draft not found" };
  }
  if (post.status !== "draft") {
    return { success: false, error: "Post is not a draft" };
  }
  const mediaIds = post.mediaIds ?? [];
  const media =
    mediaIds.length > 0 ? await getPostMedia(session.user.id, mediaIds) : [];
  const [row] = await db
    .select({ metadata: posts.metadata })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, session.user.id)));
  return {
    success: true,
    draft: {
      id: post.id,
      originalContent: post.originalContent,
      scheduledAt: post.scheduledAt,
      connectedAccountIds: post.connectedAccountIds,
      media,
      metadata: (row?.metadata as Record<string, unknown>) ?? null,
    },
  };
}

export type DeleteDraftResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteDraft(postId: string): Promise<DeleteDraftResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }
  if (!isValidUUID(postId)) {
    return { success: false, error: "Invalid post ID" };
  }
  try {
    const [post] = await db
      .select({ id: posts.id, status: posts.status })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, session.user.id)));
    if (!post) {
      return { success: false, error: "Post not found" };
    }
    if (post.status !== "draft") {
      return { success: false, error: "Only drafts can be deleted" };
    }
    await db
      .delete(postPublications)
      .where(eq(postPublications.postId, postId));
    await db.delete(posts).where(eq(posts.id, postId));
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/posts");
    revalidatePath("/dashboard/posts/drafts");
    return { success: true };
  } catch (e) {
    console.error("deleteDraft error:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to delete draft",
    };
  }
}

/** Save draft changes (content, accounts, media). Keeps status as draft. */
export async function updateDraft(
  draftId: string,
  content: string,
  selectedAccountIds: string[],
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
): Promise<UpdatePostResult> {
  return updatePost(
    draftId,
    content,
    selectedAccountIds,
    null,
    mediaIds.length > 0 ? mediaIds : undefined,
    metadata,
  );
}

export type UpdateAndPublishResult =
  | { success: true; postId: string; allPlatformsFailed?: boolean }
  | { success: false; error: string };

/** Update draft content/accounts/media then publish now. */
export async function updateAndPublish(
  draftId: string,
  content: string,
  selectedAccountIds: string[],
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
): Promise<UpdateAndPublishResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }
  const result = await updatePost(
    draftId,
    content,
    selectedAccountIds,
    new Date(),
    mediaIds.length > 0 ? mediaIds : undefined,
    metadata,
  );
  if (!result.success) {
    return result;
  }
  try {
    const publishResult = await executePublish(draftId, session.user.id);
    const succeededCount =
      publishResult.results?.filter((r) => r.status === "published")
        .length ?? 0;
    const allPlatformsFailed =
      (publishResult.results?.length ?? 0) > 0 && succeededCount === 0;
    return {
      success: true,
      postId: draftId,
      allPlatformsFailed: allPlatformsFailed || undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Publish failed after update",
    };
  }
}

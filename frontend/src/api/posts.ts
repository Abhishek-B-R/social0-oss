import { rpc } from "@/lib/rpc";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { PostMediaRow } from "@/features/dashboard/posts/post-types";

export type PostAgainResult =
  | {
      success: true;
      newPostId: string;
      /** Publish job the server enqueued (follow it with the job SSE stream). */
      trackingId?: string;
      streamUrl?: string | null;
    }
  | { success: false; error: string };

export type CreatePostResult =
  | {
      success: true;
      postId: string;
      allPlatformsFailed?: boolean;
      /** True when createPost already fanned out to CF/BullMQ. */
      queued?: boolean;
      trackingId?: string;
      streamUrl?: string;
    }
  | { success: false; error: string };

export type PublishMode = "draft" | "now" | "scheduled";

export type DeletePostResult =
  | { success: true }
  | { success: false; error: string };

export type UpdatePostResult =
  | { success: true }
  | { success: false; error: string };

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

export type GetScheduledPostResult =
  | {
      success: true;
      post: {
        id: string;
        originalContent: string | null;
        scheduledAt: Date | null;
        connectedAccountIds: string[];
        media: PostMediaRow[];
        metadata: Record<string, unknown> | null;
        queueSlotId: string | null;
      };
    }
  | { success: false; error: string };

export type GetPostToEditResult =
  | {
      success: true;
      post: {
        id: string;
        originalContent: string | null;
        scheduledAt: Date | null;
        connectedAccountIds: string[];
        media: PostMediaRow[];
        metadata: Record<string, unknown> | null;
        queueSlotId: string | null;
      };
    }
  | { success: false; error: string };

export type DeleteDraftResult =
  | { success: true }
  | { success: false; error: string };

export type UpdateAndPublishResult =
  | {
      success: true;
      postId: string;
      allPlatformsFailed?: boolean;
      /** updateAndPublish: always enqueued; these drive the publish tray. */
      queued?: boolean;
      trackingId?: string;
      streamUrl?: string;
    }
  | { success: false; error: string };

export async function createPost(
  content: string,
  selectedAccountIds: string[],
  mode: PublishMode,
  scheduledAt: Date | null,
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
  queueSlotId?: string | null,
): Promise<CreatePostResult> {
  return rpc("posts.createPost", content, selectedAccountIds, mode, scheduledAt, mediaIds, metadata, queueSlotId);
}

export async function deletePost(postId: string): Promise<DeletePostResult> {
  return rpc("posts.deletePost", postId);
}

/** Server cap per bulk call (`POSTS_BATCH_MAX` in backend services/posts.ts). */
export const POSTS_BATCH_MAX = 100;

export type PostsBatchResult = {
  ok: string[];
  failed: { id: string; error: string }[];
};

/** Delete up to `POSTS_BATCH_MAX` posts in one request (one rate-limit hit). */
export async function deletePostsBatch(postIds: string[]): Promise<PostsBatchResult> {
  return rpc("posts.deletePosts", postIds);
}

export type DuplicatePostInput = {
  sourceId: string;
  content: string;
  accountIds: string[];
  mediaIds: string[];
  metadata?: Record<string, unknown>;
};

/** Copy up to `POSTS_BATCH_MAX` posts into drafts in one request. */
export async function duplicatePostsBatch(
  items: DuplicatePostInput[],
): Promise<PostsBatchResult & { createdIds: string[] }> {
  return rpc("posts.duplicatePosts", items);
}

export async function postAgain(postId: string): Promise<PostAgainResult> {
  return rpc("posts.postAgain", postId);
}

export async function updatePost(
  postId: string,
  content: string,
  selectedAccountIds: string[],
  scheduledAt: Date | null,
  mediaIds?: string[],
  metadata?: Record<string, unknown>,
  queueSlotId?: string | null,
): Promise<UpdatePostResult> {
  return rpc("posts.updatePost", postId, content, selectedAccountIds, scheduledAt, mediaIds, metadata, queueSlotId);
}

export type ReschedulePostResult =
  | {
      success: true;
      postId: string;
      /** ISO time the post is now scheduled for. */
      scheduledAt: string;
      /** Queue slot it is linked to, or null when it now has its own time. */
      queueSlotId: string | null;
    }
  | { success: false; error: string };

/**
 * Move a scheduled post to a new time (calendar drag, bulk Reschedule).
 * Only scheduled posts can move. Pass `queueSlotId` when dropped on a queue
 * slot; otherwise any slot link is released. For Undo, call again with the
 * previous time (and previous slot id, if it had one).
 */
export async function reschedulePost(
  postId: string,
  scheduledAt: Date,
  opts?: { queueSlotId?: string | null },
): Promise<ReschedulePostResult> {
  return rpc("posts.reschedule", postId, scheduledAt, opts ?? null);
}

export async function updateScheduledPostAutoFeatures(
  postId: string,
  opts: {
    autoPlugConfig: AutoPlugConfig | null;
    resurfaceConfig: AutoResurfaceConfig | null;
  },
): Promise<{ success: true } | { success: false; error: string }> {
  return rpc("posts.updateScheduledPostAutoFeatures", postId, opts);
}

export async function getDraft(postId: string): Promise<GetDraftResult> {
  return rpc("posts.getDraft", postId);
}

export async function getScheduledPost(postId: string): Promise<GetScheduledPostResult> {
  return rpc("posts.getScheduledPost", postId);
}

export async function getPostToEdit(postId: string): Promise<GetPostToEditResult> {
  return rpc("posts.getPostToEdit", postId);
}

export async function deleteDraft(postId: string): Promise<DeleteDraftResult> {
  return rpc("posts.deleteDraft", postId);
}

export async function updateDraft(
  draftId: string,
  content: string,
  selectedAccountIds: string[],
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
): Promise<UpdateAndPublishResult> {
  return rpc("posts.updateDraft", draftId, content, selectedAccountIds, mediaIds, metadata);
}

export async function updateAndPublish(
  draftId: string,
  content: string,
  selectedAccountIds: string[],
  mediaIds: string[] = [],
  metadata?: Record<string, unknown>,
): Promise<UpdateAndPublishResult> {
  return rpc("posts.updateAndPublish", draftId, content, selectedAccountIds, mediaIds, metadata);
}


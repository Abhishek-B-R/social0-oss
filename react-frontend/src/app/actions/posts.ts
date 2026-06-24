import { rpc } from "@/lib/rpc";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { PostMediaRow } from "@/app/dashboard/posts/posts-list-data";

export type PostAgainResult =
  | { success: true; newPostId: string }
  | { success: false; error: string };

export type CreatePostResult =
  | { success: true; postId: string; allPlatformsFailed?: boolean }
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
  | { success: true; postId: string; allPlatformsFailed?: boolean }
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

export async function loadEditPostPageData(postId: string) {
  return rpc("posts.loadEditPostPageData", postId);
}

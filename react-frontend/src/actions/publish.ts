import { rpc } from "@/lib/rpc";

export type PublishResult = {
  success: boolean;
  error?: string;
  results: {
    platform: string;
    connectedAccountId: string;
    status: "published" | "failed";
    platformPostUrl?: string | null;
    error?: string;
  }[];
};

/** Runtime-only options at publish time (not persisted to DB). */
export type PublishOptions = {
  instagramConfig?: {
    coverImageUrl?: string;
    isTrialReel: boolean;
  };
  tiktokConfig?: {
    /** When true, let TikTok auto-add recommended music for photo posts. */
    autoAddMusic?: boolean;
  };
};

/**
 * Returns the list of publications for a post (for progress UI).
 * Caller must be authenticated and own the post.
 */

export async function getPostPublicationList(
  postId: string,
): Promise<
  {
    publicationId: string;
    connectedAccountId: string;
    platform: string;
    platformUsername: string | null;
    publicationStatus: string;
    platformPostUrl: string | null;
    lastError: string | null;
  }[]
> {
  return rpc("publish.getPostPublicationList", postId);
}

export async function executePublish(postId: string, userId?: string, publicationIdFilter?: string, options?: PublishOptions) {
  return rpc("publish.executePublish", postId, userId, publicationIdFilter, options);
}

export async function publishPost(postId: string, options?: PublishOptions, publicationIdFilter?: string): Promise<PublishResult> {
  return rpc("publish.publishPost", postId, options, publicationIdFilter);
}

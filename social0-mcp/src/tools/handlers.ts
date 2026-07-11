import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Social0ApiError } from "../api/client.js";
import { accountsApi, mediaApi, postsApi, publishApi } from "../api/index.js";
import { formatPlatformSuggestions, suggestPlatforms } from "../api/platform-suggestions.js";
import type {
  CreatePostInput,
  DeletePostInput,
  GetPostInput,
  GetPublishStatusInput,
  ListPostsInput,
  PublishNowInput,
  PublishPostInput,
  ScheduleContentInput,
  SchedulePostInput,
  SuggestBestPlatformsInput,
  UpdatePostInput,
  UploadMediaInput,
} from "../schemas/tools.js";
import type { Platform, PublishNowResult, ScheduleResult } from "../types/index.js";
import { formatAccountsList, formatPostSummary, resolveAccountIds } from "../utils/accounts.js";
import { formatToolError, readLocalFile } from "../utils/index.js";

function textResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

function jsonResult(data: unknown): CallToolResult {
  return textResult(JSON.stringify(data, null, 2));
}

function handleApiError(context: string, error: unknown): CallToolResult {
  if (error instanceof Social0ApiError) {
    return textResult(
      formatToolError(context, error.toToolMessage(), error.isNotImplemented
        ? "Post CRUD via API key is rolling out on the /v1 REST API. Media upload, publish, and job status work today."
        : undefined),
      true,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return textResult(formatToolError(context, message), true);
}

function isScheduleResult(result: PublishNowResult | ScheduleResult): result is ScheduleResult {
  return "scheduledAt" in result;
}

export async function handleListAccounts(): Promise<CallToolResult> {
  try {
    const accounts = await accountsApi.listAccounts();
    return textResult(`Connected accounts (${accounts.length}):\n\n${formatAccountsList(accounts)}`);
  } catch (error) {
    return handleApiError("list accounts", error);
  }
}

export async function handleCreatePost(input: CreatePostInput): Promise<CallToolResult> {
  try {
    const accounts = await accountsApi.listAccounts();
    const { accountIds, errors } = resolveAccountIds(input.platforms, accounts);
    if (errors.length > 0) {
      return textResult(formatToolError("create post", errors.join("; ")), true);
    }
    if (accountIds.length === 0) {
      return textResult(formatToolError("create post", "No valid target accounts"), true);
    }

    const post = await postsApi.createPost({
      caption: input.content,
      social_accounts: accountIds,
      media: input.media ?? null,
      is_draft: input.is_draft,
    });

    return jsonResult({
      success: true,
      post,
      message: input.is_draft
        ? `Draft created (${post.id}). Use publish_post or schedule_post when ready.`
        : `Post created (${post.id}).`,
    });
  } catch (error) {
    return handleApiError("create post", error);
  }
}

export async function handleUpdatePost(input: UpdatePostInput): Promise<CallToolResult> {
  try {
    const payload: Parameters<typeof postsApi.updatePost>[1] = {};

    if (input.content !== undefined) payload.caption = input.content;
    if (input.media !== undefined) payload.media = input.media;
    if (input.is_draft !== undefined) payload.is_draft = input.is_draft;

    if (input.platforms) {
      const accounts = await accountsApi.listAccounts();
      const { accountIds, errors } = resolveAccountIds(input.platforms, accounts);
      if (errors.length > 0) {
        return textResult(formatToolError("update post", errors.join("; ")), true);
      }
      payload.social_accounts = accountIds;
    }

    const post = await postsApi.updatePost(input.post_id, payload);
    return jsonResult({ success: true, post });
  } catch (error) {
    return handleApiError("update post", error);
  }
}

export async function handleDeletePost(input: DeletePostInput): Promise<CallToolResult> {
  try {
    await postsApi.deletePost(input.post_id);
    return jsonResult({ success: true, message: `Post ${input.post_id} deleted.` });
  } catch (error) {
    return handleApiError("delete post", error);
  }
}

export async function handleListPosts(input: ListPostsInput): Promise<CallToolResult> {
  try {
    const listParams: Parameters<typeof postsApi.listPosts>[0] = { limit: input.limit };
    if (input.status !== undefined) listParams.status = input.status;
    if (input.platform !== undefined) listParams.platform = input.platform;
    if (input.search !== undefined) listParams.search = input.search;

    const response = await postsApi.listPosts(listParams);

    if (response.data.length === 0) {
      return textResult("No posts found matching your filters.");
    }

    const lines = response.data.map((p) => formatPostSummary({
      id: p.id,
      caption: p.caption,
      status: p.status,
      scheduled_at: p.scheduled_at,
      is_draft: p.is_draft,
    }));

    return textResult(
      `Posts (${response.data.length} of ${response.meta.total}):\n\n${lines.join("\n")}`,
    );
  } catch (error) {
    return handleApiError("list posts", error);
  }
}

export async function handleGetPost(input: GetPostInput): Promise<CallToolResult> {
  try {
    const post = await postsApi.getPost(input.post_id);
    return jsonResult(post);
  } catch (error) {
    return handleApiError("get post", error);
  }
}

export async function handlePublishPost(input: PublishPostInput): Promise<CallToolResult> {
  try {
    let connectedAccountIds: string[] | undefined;
    if (input.platforms) {
      const accounts = await accountsApi.listAccounts();
      const resolved = resolveAccountIds(input.platforms, accounts);
      if (resolved.errors.length > 0) {
        return textResult(formatToolError("publish post", resolved.errors.join("; ")), true);
      }
      connectedAccountIds = resolved.accountIds;
    }

    const result = await publishApi.publishPost({
      postId: input.post_id,
      mode: "now",
      ...(connectedAccountIds ? { connectedAccountIds } : {}),
    });

    if (isScheduleResult(result)) {
      return jsonResult(result);
    }

    return jsonResult({
      success: true,
      trackingId: result.trackingId,
      status: result.status,
      streamUrl: result.streamUrl,
      message: `Publishing started. Use get_publish_status with tracking_id=${result.trackingId} to monitor.`,
    });
  } catch (error) {
    return handleApiError("publish post", error);
  }
}

export async function handleSchedulePost(input: SchedulePostInput): Promise<CallToolResult> {
  try {
    let connectedAccountIds: string[] | undefined;
    if (input.platforms) {
      const accounts = await accountsApi.listAccounts();
      const resolved = resolveAccountIds(input.platforms, accounts);
      if (resolved.errors.length > 0) {
        return textResult(formatToolError("schedule post", resolved.errors.join("; ")), true);
      }
      connectedAccountIds = resolved.accountIds;
    }

    const result = await publishApi.publishPost({
      postId: input.post_id,
      scheduledAt: input.scheduled_at,
      mode: "schedule",
      ...(connectedAccountIds ? { connectedAccountIds } : {}),
    });

    return jsonResult({
      success: true,
      ...result,
      message: `Post scheduled for ${input.scheduled_at}.`,
    });
  } catch (error) {
    return handleApiError("schedule post", error);
  }
}

export async function handleUploadMedia(input: UploadMediaInput): Promise<CallToolResult> {
  try {
    const file = await readLocalFile(input.file_path);
    const media = await mediaApi.uploadMediaBuffer({
      buffer: file.buffer,
      filename: file.filename,
      mimeType: file.mimeType,
    });

    return jsonResult({
      success: true,
      mediaId: media.id,
      url: media.url,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      message: `Uploaded ${file.filename}. Use mediaId in create_post, publish_now, or schedule_content.`,
    });
  } catch (error) {
    return handleApiError("upload media", error);
  }
}

export async function handlePublishNow(input: PublishNowInput): Promise<CallToolResult> {
  try {
    const accounts = await accountsApi.listAccounts();
    const { accountIds, errors } = resolveAccountIds(input.platforms, accounts);
    if (errors.length > 0) {
      return textResult(formatToolError("publish now", errors.join("; ")), true);
    }

    const post = await postsApi.createPost({
      caption: input.content,
      social_accounts: accountIds,
      media: input.media ?? null,
      is_draft: false,
    });

    const result = await publishApi.publishPost({
      postId: post.id,
      mode: "now",
      connectedAccountIds: accountIds,
    });

    if (isScheduleResult(result)) {
      return jsonResult(result);
    }

    return jsonResult({
      success: true,
      postId: post.id,
      trackingId: result.trackingId,
      status: result.status,
      message: "Post created and publishing started.",
    });
  } catch (error) {
    return handleApiError("publish now", error);
  }
}

export async function handleScheduleContent(input: ScheduleContentInput): Promise<CallToolResult> {
  try {
    const accounts = await accountsApi.listAccounts();
    const { accountIds, errors } = resolveAccountIds(input.platforms, accounts);
    if (errors.length > 0) {
      return textResult(formatToolError("schedule content", errors.join("; ")), true);
    }

    const post = await postsApi.createPost({
      caption: input.content,
      social_accounts: accountIds,
      media: input.media ?? null,
      is_draft: false,
      scheduled_at: input.scheduled_at,
    });

    const result = await publishApi.publishPost({
      postId: post.id,
      scheduledAt: input.scheduled_at,
      mode: "schedule",
      connectedAccountIds: accountIds,
    });

    return jsonResult({
      success: true,
      postId: post.id,
      scheduledAt: input.scheduled_at,
      ...result,
      message: `Content created and scheduled for ${input.scheduled_at}.`,
    });
  } catch (error) {
    return handleApiError("schedule content", error);
  }
}

export async function handleGetPublishStatus(input: GetPublishStatusInput): Promise<CallToolResult> {
  try {
    const snapshot = await publishApi.getPublishStatus(input.tracking_id);

    const platformEvents = snapshot.events.filter((e) => e.platform);
    const platformStatuses = platformEvents.map((e) => ({
      platform: e.platform,
      phase: e.phase,
      message: e.message,
      accountId: e.connectedAccountId,
    }));

    const errors = snapshot.events
      .filter((e) => e.phase === "platform_failed")
      .map((e) => ({
        platform: e.platform,
        message: e.message ?? "Unknown error",
      }));

    return jsonResult({
      trackingId: snapshot.trackingId,
      postId: snapshot.postId,
      overallStatus: snapshot.status,
      progress: {
        total: snapshot.total,
        completed: snapshot.completed,
        failed: snapshot.failed,
      },
      platformStatuses,
      errors,
      updatedAt: snapshot.updatedAt,
    });
  } catch (error) {
    return handleApiError("get publish status", error);
  }
}

export async function handleSuggestBestPlatforms(
  input: SuggestBestPlatformsInput,
): Promise<CallToolResult> {
  try {
    let connectedPlatforms: Platform[] | undefined;
    try {
      const accounts = await accountsApi.listAccounts();
      connectedPlatforms = accounts
        .filter((a) => a.isActive)
        .map((a) => a.platform as Platform);
    } catch {
      // ponytail: offline heuristic if accounts can't be fetched
    }

    const suggestions = suggestPlatforms({
      content: input.content,
      hasMedia: input.has_media,
      ...(input.media_is_video !== undefined ? { mediaIsVideo: input.media_is_video } : {}),
      ...(connectedPlatforms ? { connectedPlatforms } : {}),
    });

    const recommended = suggestions.filter((s) => s.recommended).map((s) => s.platform);

    return textResult(
      `Platform recommendations:\n\n${formatPlatformSuggestions(suggestions)}\n\nRecommended: ${recommended.join(", ") || "none"}`,
    );
  } catch (error) {
    return handleApiError("suggest platforms", error);
  }
}

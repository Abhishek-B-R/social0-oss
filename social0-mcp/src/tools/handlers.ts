import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Social0ApiError } from "../api/client.js";
import { accountsApi, mediaApi, postsApi, publishApi } from "../api/index.js";
import { formatPlatformSuggestions, suggestPlatforms, inferPostFormForSuggestion } from "../api/platform-suggestions.js";
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
import type { Platform } from "../types/index.js";
import { formatAccountsList, formatPostSummary, resolveAccountIds } from "../utils/accounts.js";
import { formatToolError, readLocalFile } from "../utils/index.js";
import { resolvePostFormFromMediaIds, validatePlatformsForForm } from "../utils/post-form.js";

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
    return textResult(formatToolError(context, error.toToolMessage()), true);
  }
  const message = error instanceof Error ? error.message : String(error);
  return textResult(formatToolError(context, message), true);
}

async function resolveAccountsForPost(
  context: string,
  platforms: string[],
  accounts: Awaited<ReturnType<typeof accountsApi.listAccounts>>,
  media?: string[],
): Promise<{ accountIds: string[]; error?: CallToolResult }> {
  const { accountIds, errors } = resolveAccountIds(platforms, accounts);
  if (errors.length > 0) {
    return { accountIds: [], error: textResult(formatToolError(context, errors.join("; ")), true) };
  }
  if (accountIds.length === 0) {
    return { accountIds: [], error: textResult(formatToolError(context, "No valid target accounts"), true) };
  }

  const { form, mediaErrors } = await resolvePostFormFromMediaIds(media);
  if (mediaErrors.length > 0) {
    return { accountIds: [], error: textResult(formatToolError(context, mediaErrors.join("; ")), true) };
  }
  const formErrors = validatePlatformsForForm(form, accountIds, accounts, media);
  if (formErrors.length > 0) {
    return { accountIds: [], error: textResult(formatToolError(context, formErrors.join("; ")), true) };
  }

  return { accountIds };
}

async function updateExistingPostTargets(input: {
  context: string;
  postId: string;
  platforms?: string[];
  media?: string[];
  platform_options?: Record<string, unknown>;
}): Promise<CallToolResult | null> {
  if (
    input.platforms === undefined &&
    input.media === undefined &&
    input.platform_options === undefined
  ) {
    return null;
  }

  const [post, accounts] = await Promise.all([
    postsApi.getPost(input.postId),
    accountsApi.listAccounts(),
  ]);

  let accountIds: string[];
  if (input.platforms !== undefined) {
    const resolved = resolveAccountIds(input.platforms, accounts);
    if (resolved.errors.length > 0) {
      return textResult(formatToolError(input.context, resolved.errors.join("; ")), true);
    }
    accountIds = resolved.accountIds;
  } else {
    accountIds = [
      ...new Set(post.platforms.map((p) => p.connected_account_id).filter(Boolean)),
    ];
  }

  if (accountIds.length === 0) {
    return textResult(formatToolError(input.context, "No valid target accounts"), true);
  }

  const media = input.media ?? post.media_ids;
  const { form, mediaErrors } = await resolvePostFormFromMediaIds(media);
  if (mediaErrors.length > 0) {
    return textResult(formatToolError(input.context, mediaErrors.join("; ")), true);
  }
  const formErrors = validatePlatformsForForm(form, accountIds, accounts, media);
  if (formErrors.length > 0) {
    return textResult(formatToolError(input.context, formErrors.join("; ")), true);
  }

  const payload: Parameters<typeof postsApi.updatePost>[1] = {};
  if (input.platforms !== undefined) payload.platforms = accountIds;
  if (input.media !== undefined) payload.media = input.media;
  if (input.platform_options !== undefined) payload.platform_options = input.platform_options;

  if (Object.keys(payload).length > 0) {
    await postsApi.updatePost(input.postId, payload);
  }

  return null;
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
    const { accountIds, error } = await resolveAccountsForPost(
      "create post",
      input.platforms,
      accounts,
      input.media,
    );
    if (error) return error;

    const created = await postsApi.createPost({
      content: input.content,
      platforms: accountIds,
      ...(input.media ? { media: input.media } : {}),
      ...(input.platform_options ? { platform_options: input.platform_options } : {}),
    });

    const post = await postsApi.getPost(created.id);

    return jsonResult({
      success: true,
      post,
      message: `Draft created (${created.id}). Use publish_post or schedule_post when ready.`,
    });
  } catch (error) {
    return handleApiError("create post", error);
  }
}

export async function handleUpdatePost(input: UpdatePostInput): Promise<CallToolResult> {
  try {
    const payload: Parameters<typeof postsApi.updatePost>[1] = {};

    if (input.content !== undefined) payload.content = input.content;
    if (input.media !== undefined) payload.media = input.media;
    if (input.platform_options !== undefined) payload.platform_options = input.platform_options;

    if (input.platforms) {
      const accounts = await accountsApi.listAccounts();
      const { accountIds, errors } = resolveAccountIds(input.platforms, accounts);
      if (errors.length > 0) {
        return textResult(formatToolError("update post", errors.join("; ")), true);
      }
      const media = input.media ?? (await postsApi.getPost(input.post_id)).media_ids;
      const { form, mediaErrors } = await resolvePostFormFromMediaIds(media);
      if (mediaErrors.length > 0) {
        return textResult(formatToolError("update post", mediaErrors.join("; ")), true);
      }
      const formErrors = validatePlatformsForForm(form, accountIds, accounts, media);
      if (formErrors.length > 0) {
        return textResult(formatToolError("update post", formErrors.join("; ")), true);
      }
      payload.platforms = accountIds;
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
    if (input.connected_account_id !== undefined) {
      listParams.connected_account_id = input.connected_account_id;
    } else if (input.account !== undefined) {
      const accounts = await accountsApi.listAccounts();
      const { accountIds, errors } = resolveAccountIds([input.account], accounts);
      if (errors.length > 0) {
        return textResult(formatToolError("list posts", errors.join("; ")), true);
      }
      const accountId = accountIds[0];
      if (!accountId) {
        return textResult(formatToolError("list posts", "No valid target account"), true);
      }
      listParams.connected_account_id = accountId;
    }

    const response = await postsApi.listPosts(listParams);

    if (response.data.length === 0) {
      return textResult("No posts found matching your filters.");
    }

    const lines = response.data.map((p) =>
      formatPostSummary({
        id: p.id,
        content: p.content,
        status: p.status,
        scheduled_at: p.scheduled_at,
      }),
    );

    return textResult(
      `Posts (${response.data.length} of ${response.pagination.total}):\n\n${lines.join("\n")}`,
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
    const updateError = await updateExistingPostTargets({
      context: "publish post",
      postId: input.post_id,
      ...(input.platforms !== undefined ? { platforms: input.platforms } : {}),
      ...(input.media !== undefined ? { media: input.media } : {}),
      ...(input.platform_options !== undefined ? { platform_options: input.platform_options } : {}),
    });
    if (updateError) return updateError;

    const result = await postsApi.publishPost(input.post_id);

    return jsonResult({
      success: true,
      tracking_id: result.tracking_id,
      status: result.status,
      stream_url: result.stream_url,
      message: `Publishing started. Use get_publish_status with tracking_id=${result.tracking_id} to monitor.`,
    });
  } catch (error) {
    return handleApiError("publish post", error);
  }
}

export async function handleSchedulePost(input: SchedulePostInput): Promise<CallToolResult> {
  try {
    const updateError = await updateExistingPostTargets({
      context: "schedule post",
      postId: input.post_id,
      ...(input.platforms !== undefined ? { platforms: input.platforms } : {}),
      ...(input.media !== undefined ? { media: input.media } : {}),
      ...(input.platform_options !== undefined ? { platform_options: input.platform_options } : {}),
    });
    if (updateError) return updateError;

    const result = await postsApi.schedulePost(input.post_id, {
      scheduledAt: input.scheduled_at,
    });

    return jsonResult({
      success: true,
      ...result,
      message: `Post scheduled for ${result.scheduled_at}.`,
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
      message: `Uploaded ${file.filename}. Use mediaId in create_post, publish_post, schedule_post, publish_now, or schedule_content.`,
    });
  } catch (error) {
    return handleApiError("upload media", error);
  }
}

export async function handlePublishNow(input: PublishNowInput): Promise<CallToolResult> {
  try {
    const accounts = await accountsApi.listAccounts();
    const { accountIds, error } = await resolveAccountsForPost(
      "publish now",
      input.platforms,
      accounts,
      input.media,
    );
    if (error) return error;

    const result = await postsApi.publishNow({
      content: input.content,
      platforms: accountIds,
      ...(input.media ? { media: input.media } : {}),
      ...(input.platform_options ? { platform_options: input.platform_options } : {}),
    });

    return jsonResult({
      success: true,
      post_id: result.post_id,
      tracking_id: result.tracking_id,
      status: result.status,
      stream_url: result.stream_url,
      message: "Post created and publishing started.",
    });
  } catch (error) {
    return handleApiError("publish now", error);
  }
}

export async function handleScheduleContent(input: ScheduleContentInput): Promise<CallToolResult> {
  try {
    const accounts = await accountsApi.listAccounts();
    const { accountIds, error } = await resolveAccountsForPost(
      "schedule content",
      input.platforms,
      accounts,
      input.media,
    );
    if (error) return error;

    const result = await postsApi.scheduleContent({
      content: input.content,
      platforms: accountIds,
      scheduledAt: input.scheduled_at,
      ...(input.media ? { media: input.media } : {}),
      ...(input.platform_options ? { platform_options: input.platform_options } : {}),
    });

    return jsonResult({
      success: true,
      post_id: result.post_id,
      scheduled_at: result.scheduled_at,
      status: result.status,
      message: `Content created and scheduled for ${result.scheduled_at}.`,
    });
  } catch (error) {
    return handleApiError("schedule content", error);
  }
}

export async function handleGetPublishStatus(input: GetPublishStatusInput): Promise<CallToolResult> {
  try {
    const snapshot = await publishApi.getPublishStatus(input.tracking_id);

    return jsonResult({
      tracking_id: snapshot.tracking_id,
      post_id: snapshot.post_id,
      overall_status: snapshot.status,
      progress: {
        total: snapshot.total,
        completed: snapshot.completed,
        failed: snapshot.failed,
      },
      platform_statuses: snapshot.platform_statuses,
      errors: snapshot.errors,
      failure_reason: snapshot.failure_reason,
      created_at: snapshot.created_at,
      completed_at: snapshot.completed_at,
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
        .filter((a) => a.is_active)
        .map((a) => a.platform as Platform);
    } catch {
      // Fall back to offline heuristics if accounts cannot be fetched.
    }

    const hasMedia =
      input.has_media ||
      input.media_is_video === true ||
      input.media_type === "image" ||
      input.media_type === "video";
    const form = inferPostFormForSuggestion({
      hasMedia,
      ...(input.media_is_video !== undefined ? { mediaIsVideo: input.media_is_video } : {}),
      ...(input.media_type !== undefined ? { mediaType: input.media_type } : {}),
    });

    const suggestions = suggestPlatforms({
      content: input.content,
      hasMedia: input.has_media || input.media_is_video === true,
      ...(input.media_is_video !== undefined ? { mediaIsVideo: input.media_is_video } : {}),
      ...(input.media_type ? { mediaType: input.media_type } : {}),
      ...(connectedPlatforms ? { connectedPlatforms } : {}),
    });

    const recommended = suggestions.filter((s) => s.recommended).map((s) => s.platform);

    return textResult(
      `Platform recommendations:\n\n${formatPlatformSuggestions(suggestions, form)}\n\nRecommended: ${recommended.join(", ") || "none"}`,
    );
  } catch (error) {
    return handleApiError("suggest platforms", error);
  }
}

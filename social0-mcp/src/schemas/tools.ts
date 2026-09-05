import { z } from "zod";
import { SUPPORTED_PLATFORMS } from "../types/index.js";

export const platformSchema = z.enum(SUPPORTED_PLATFORMS);
const mediaIdSchema = z.string().uuid().transform((id) => id.toLowerCase());
const platformOptionsSchema = z
  .record(z.unknown())
  .describe("Advanced per-platform settings, e.g. tiktok, instagram, pinterest, youtube, x/twitter_x, linkedin");

export const listAccountsInputSchema = z.object({}).strict();

export const createPostInputSchema = z.object({
  content: z.string().min(1).describe("Post caption / text content"),
  platforms: z
    .array(z.string().min(1))
    .min(1)
    .describe("Platform names (linkedin, twitter_x, etc.) or connected account UUIDs"),
  media: z
    .array(mediaIdSchema)
    .optional()
    .describe("Media upload IDs from upload_media"),
  platform_options: platformOptionsSchema.optional(),
});

export const updatePostInputSchema = z.object({
  post_id: z.string().uuid().describe("Post ID to update"),
  content: z.string().min(1).optional().describe("Updated caption"),
  platforms: z.array(z.string().min(1)).optional().describe("Updated target platforms or account IDs"),
  media: z.array(mediaIdSchema).optional().describe("Updated media IDs"),
  platform_options: platformOptionsSchema.optional(),
});

export const deletePostInputSchema = z.object({
  post_id: z.string().uuid().describe("Post ID to delete"),
});

export const listPostsInputSchema = z.object({
  status: z
    .enum(["draft", "scheduled", "publishing", "published", "partial", "failed"])
    .optional()
    .describe("Filter by post status"),
  platform: platformSchema.optional().describe("Filter by platform"),
  account: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by connected account UUID or unambiguous platform name"),
  connected_account_id: z.string().uuid().optional().describe("Filter by connected account UUID"),
  search: z.string().optional().describe("Search in post content"),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const getPostInputSchema = z.object({
  post_id: z.string().uuid().describe("Post ID to retrieve"),
});

export const publishPostInputSchema = z.object({
  post_id: z.string().uuid().describe("Draft or scheduled post ID to publish immediately"),
  platforms: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional subset of platforms/account IDs to publish to"),
  media: z
    .array(mediaIdSchema)
    .optional()
    .describe("Optional media IDs from upload_media to attach before publishing"),
  platform_options: platformOptionsSchema.optional(),
});

export const schedulePostInputSchema = z.object({
  post_id: z.string().uuid().describe("Post ID to schedule"),
  scheduled_at: z
    .string()
    .describe("ISO 8601 datetime for when to publish, e.g. 2026-07-12T09:00:00.000Z"),
  platforms: z.array(z.string().min(1)).optional(),
  media: z
    .array(mediaIdSchema)
    .optional()
    .describe("Optional media IDs from upload_media to attach before scheduling"),
  platform_options: platformOptionsSchema.optional(),
});

export const uploadMediaInputSchema = z
  .object({
    file_path: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Local filesystem path (same machine as the MCP server). Prefer url or data for remote AI hosts.",
      ),
    url: z
      .string()
      .url()
      .optional()
      .describe(
        "Public https URL the MCP server can download (direct file URL, not a share page).",
      ),
    data: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Base64-encoded file bytes, or a data: URL (data:image/png;base64,...).",
      ),
    filename: z
      .string()
      .min(1)
      .optional()
      .describe("Original filename with extension. Required for data; optional for url."),
    mime_type: z
      .string()
      .min(1)
      .optional()
      .describe("MIME type, e.g. image/png or video/mp4. Inferred from filename/url when possible."),
  })
  .strict()
  .superRefine((value, ctx) => {
    const sources = [value.file_path, value.url, value.data].filter(
      (v) => typeof v === "string" && v.length > 0,
    );
    if (sources.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide exactly one of: file_path (local MCP), url (remote download), or data (base64).",
      });
    }
    if (value.data && !value.filename && !value.mime_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["filename"],
        message: "filename (with extension) or mime_type is required when using data.",
      });
    }
  });

export const publishNowInputSchema = z.object({
  content: z.string().min(1).describe("Post caption"),
  platforms: z.array(z.string().min(1)).min(1).describe("Target platforms or account IDs"),
  media: z.array(mediaIdSchema).optional().describe("Media IDs from upload_media"),
  platform_options: platformOptionsSchema.optional(),
});

export const scheduleContentInputSchema = z.object({
  content: z.string().min(1).describe("Post caption"),
  platforms: z.array(z.string().min(1)).min(1).describe("Target platforms or account IDs"),
  scheduled_at: z.string().describe("ISO 8601 datetime to publish"),
  media: z.array(mediaIdSchema).optional(),
  platform_options: platformOptionsSchema.optional(),
});

export const getPublishStatusInputSchema = z.object({
  tracking_id: z.string().uuid().describe("Tracking ID returned from publish operations"),
});

export const suggestBestPlatformsInputSchema = z.object({
  content: z.string().min(1).describe("Post content to analyze"),
  has_media: z.boolean().optional().default(false),
  media_is_video: z.boolean().optional(),
  media_type: z.enum(["none", "image", "video", "collection"]).optional(),
});

const windowRangeSchema = z
  .enum(["7d", "14d", "28d", "90d", "365d", "custom"])
  .describe("Lookback window. Use `custom` with since/until.");

const accountRefSchema = z
  .string()
  .min(1)
  .describe("Connected account UUID, or an unambiguous platform name (e.g. bluesky)");

const freshSchema = z
  .boolean()
  .optional()
  .describe(
    "Bypass warm cache and re-read the platform APIs. Entries younger than 90s are still served from cache.",
  );

const windowFields = {
  range: windowRangeSchema.optional(),
  since: z.string().optional().describe("ISO 8601 start (range=custom)"),
  until: z.string().optional().describe("ISO 8601 end (range=custom)"),
  account: accountRefSchema.optional().describe("Limit to one connected account"),
  fresh: freshSchema,
};

export const getAnalyticsOverviewInputSchema = z.object(windowFields);

export const getPostAnalyticsInputSchema = z.object({
  post_id: z.string().uuid().describe("Social0 post ID"),
});

export const listInboxCommentsInputSchema = z.object({
  ...windowFields,
  platform: platformSchema.optional().describe("Limit to one platform"),
  before: z
    .string()
    .optional()
    .describe("Cursor from a previous response's next_before"),
  limit: z.number().int().min(1).max(24).optional(),
  unanswered_only: z
    .boolean()
    .optional()
    .default(false)
    .describe("Only threads the connected account has not replied to"),
});

export const replyToCommentInputSchema = z.object({
  comment_id: z.string().min(1).describe("Comment ID from list_inbox_comments"),
  publication_id: z
    .string()
    .uuid()
    .describe("publication_id from the same comment - identifies which post it is on"),
  text: z.string().min(1).describe("Reply text"),
  media_id: z
    .string()
    .uuid()
    .optional()
    .describe("Media upload ID. Only X and Bluesky accept comment attachments."),
});

export const moderateCommentInputSchema = z.object({
  comment_id: z.string().min(1).describe("Comment ID from list_inbox_comments"),
  publication_id: z.string().uuid().describe("publication_id from the same comment"),
  action: z
    .enum(["like", "unlike", "hide"])
    .describe("like/unlike (X, Bluesky, YouTube, Meta) or hide (Instagram, Facebook)"),
});

export const listInboxDmsInputSchema = z.object({
  ...windowFields,
  before: z
    .string()
    .optional()
    .describe("Cursor from a previous response's next_before"),
  limit: z.number().int().min(1).max(24).optional(),
});

export const getInboxDmThreadInputSchema = z.object({
  conversation_id: z.string().min(1).describe("conversation_id from list_inbox_dms"),
  account: accountRefSchema.describe("Account that owns the conversation"),
  peer_id: z.string().optional().describe("Only needed when the platform omits it"),
  fresh: freshSchema,
});

export const replyToDmInputSchema = z.object({
  conversation_id: z.string().min(1).describe("conversation_id from list_inbox_dms"),
  account: accountRefSchema.describe("Account that owns the conversation"),
  text: z.string().min(1).describe("Message text"),
  peer_id: z.string().optional(),
  media_id: z
    .string()
    .uuid()
    .optional()
    .describe("Media upload ID. X accepts image/video, TikTok image only, Bluesky text only."),
});

export type ListAccountsInput = z.infer<typeof listAccountsInputSchema>;
export type CreatePostInput = z.infer<typeof createPostInputSchema>;
export type UpdatePostInput = z.infer<typeof updatePostInputSchema>;
export type DeletePostInput = z.infer<typeof deletePostInputSchema>;
export type ListPostsInput = z.infer<typeof listPostsInputSchema>;
export type GetPostInput = z.infer<typeof getPostInputSchema>;
export type PublishPostInput = z.infer<typeof publishPostInputSchema>;
export type SchedulePostInput = z.infer<typeof schedulePostInputSchema>;
export type UploadMediaInput = z.infer<typeof uploadMediaInputSchema>;
export type PublishNowInput = z.infer<typeof publishNowInputSchema>;
export type ScheduleContentInput = z.infer<typeof scheduleContentInputSchema>;
export type GetPublishStatusInput = z.infer<typeof getPublishStatusInputSchema>;
export type SuggestBestPlatformsInput = z.infer<typeof suggestBestPlatformsInputSchema>;
export type GetAnalyticsOverviewInput = z.infer<typeof getAnalyticsOverviewInputSchema>;
export type GetPostAnalyticsInput = z.infer<typeof getPostAnalyticsInputSchema>;
export type ListInboxCommentsInput = z.infer<typeof listInboxCommentsInputSchema>;
export type ReplyToCommentInput = z.infer<typeof replyToCommentInputSchema>;
export type ModerateCommentInput = z.infer<typeof moderateCommentInputSchema>;
export type ListInboxDmsInput = z.infer<typeof listInboxDmsInputSchema>;
export type GetInboxDmThreadInput = z.infer<typeof getInboxDmThreadInputSchema>;
export type ReplyToDmInput = z.infer<typeof replyToDmInputSchema>;

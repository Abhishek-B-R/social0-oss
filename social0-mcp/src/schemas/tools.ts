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

export const uploadMediaInputSchema = z.object({
  file_path: z
    .string()
    .min(1)
    .describe("Absolute or relative path to a local image or video file"),
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

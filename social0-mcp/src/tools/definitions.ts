import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const platformEnum = [
  "linkedin",
  "facebook",
  "instagram",
  "youtube",
  "pinterest",
  "tiktok",
  "twitter_x",
  "threads",
  "bluesky",
] as const;

const postStatusEnum = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "partial",
  "failed",
] as const;

const platformOptionsProperty = {
  type: "object",
  description:
    "Advanced per-platform settings. Supports content/caption and media per platform, plus pinterest board_id/title/link/create_board, tiktok title/privacy/draft/comment/duet/stitch/commercial/AI flags, instagram cover_image_url/trial_reel, youtube title, and x/twitter_x madeWithAi/paidPartnership.",
  additionalProperties: true,
} as const;

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "list_accounts",
    description:
      "List all social media accounts connected to the user's Social0 account. Use when the user asks to see connected accounts, which platforms are linked, or before creating a post to know available targets. Example: 'Show my connected accounts.'",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_draft",
    description:
      "Create an unpublished Social0 draft (does not post to any network). Use when the user wants to write content first and publish/schedule later. For one-step live posting use publish_now. Example: 'Draft a LinkedIn post about AI.'",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Post caption / text content" },
        platforms: {
          type: "array",
          items: { type: "string" },
          description: "Platform names (linkedin, twitter_x, etc.) or connected account UUIDs",
        },
        media: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Media upload IDs from upload_media",
        },
        platform_options: platformOptionsProperty,
      },
      required: ["content", "platforms"],
      additionalProperties: false,
    },
  },
  {
    name: "update_draft",
    description:
      "Update an unpublished Social0 draft or scheduled post — caption, platforms, or media. Does not edit already-published live posts. Use before publish_post / schedule_post.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", format: "uuid", description: "Draft or scheduled post ID to update" },
        content: { type: "string", description: "Updated caption" },
        platforms: {
          type: "array",
          items: { type: "string" },
          description: "Updated target platforms or account IDs",
        },
        media: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Updated media IDs",
        },
        platform_options: platformOptionsProperty,
      },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_draft",
    description:
      "Delete an unpublished Social0 draft or scheduled post from Social0. Published/live social posts cannot be deleted with this tool — only drafts and not-yet-published schedules. Example: 'Delete yesterday's draft.'",
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          format: "uuid",
          description: "Draft or scheduled post ID to delete (not a published post)",
        },
      },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_posts",
    description:
      "List the user's Social0 posts with optional filters by status, platform, account, or search text. Use when the user asks to see drafts, scheduled posts, or published content. Example: 'Show all scheduled posts.'",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: [...postStatusEnum], description: "Filter by post status" },
        platform: { type: "string", enum: [...platformEnum], description: "Filter by platform" },
        account: {
          type: "string",
          description: "Filter by connected account UUID or unambiguous platform name",
        },
        connected_account_id: {
          type: "string",
          format: "uuid",
          description: "Filter by connected account UUID",
        },
        search: { type: "string", description: "Search in post content" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_post",
    description:
      "Get full details of a single Social0 post by ID, including caption, status, platforms, media, and schedule time.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", format: "uuid", description: "Post ID to retrieve" },
      },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "publish_post",
    description:
      "Publish an existing unpublished Social0 draft (or scheduled post) immediately to connected platforms. Returns a tracking ID to monitor progress. Example: 'Publish my latest draft to Twitter.'",
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          format: "uuid",
          description: "Draft or scheduled post ID to publish immediately",
        },
        platforms: {
          type: "array",
          items: { type: "string" },
          description: "Optional subset of platforms/account IDs to publish to",
        },
        media: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Optional media IDs from upload_media to attach before publishing",
        },
        platform_options: platformOptionsProperty,
      },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "schedule_post",
    description:
      "Schedule an existing unpublished Social0 draft for future publishing at a specific date and time. Example: 'Schedule tomorrow's announcement at 9 AM.'",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", format: "uuid", description: "Draft ID to schedule" },
        scheduled_at: {
          type: "string",
          description: "ISO 8601 datetime, e.g. 2026-07-12T09:00:00.000Z",
        },
        platforms: {
          type: "array",
          items: { type: "string" },
          description: "Optional subset of platforms/account IDs",
        },
        media: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Optional media IDs from upload_media to attach before scheduling",
        },
        platform_options: platformOptionsProperty,
      },
      required: ["post_id", "scheduled_at"],
      additionalProperties: false,
    },
  },
  {
    name: "upload_media",
    description:
      "Upload an image or video to Social0 and get a media ID for posts. For remote AI hosts (Claude.ai, ChatGPT), pass url (public direct file URL) or data (base64). file_path only works when the MCP server can read that path on its own machine.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "Local path on the MCP server machine. Do not use for remote sandboxes.",
        },
        url: {
          type: "string",
          format: "uri",
          description:
            "Public http(s) URL to download. Must be a direct file link the server can fetch.",
        },
        data: {
          type: "string",
          description:
            "Base64 file bytes or a data: URL (data:image/png;base64,...).",
        },
        filename: {
          type: "string",
          description:
            "Filename with extension (required for bare base64 data; optional for url).",
        },
        mime_type: {
          type: "string",
          description: "MIME type if not clear from filename/url (e.g. image/png).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "publish_now",
    description:
      "Create content and publish it live to connected platforms in one step (writes to external social networks). Prefer this over create_draft when the user wants to post immediately.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Post caption" },
        platforms: {
          type: "array",
          items: { type: "string" },
          description: "Target platforms or account IDs",
        },
        media: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Media IDs from upload_media",
        },
        platform_options: platformOptionsProperty,
      },
      required: ["content", "platforms"],
      additionalProperties: false,
    },
  },
  {
    name: "schedule_content",
    description:
      "Create content and schedule it for future publishing in one step (does not publish immediately). Example: 'Schedule a LinkedIn post about our launch for tomorrow at 9 AM.'",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Post caption" },
        platforms: {
          type: "array",
          items: { type: "string" },
          description: "Target platforms or account IDs",
        },
        scheduled_at: { type: "string", description: "ISO 8601 datetime to publish" },
        media: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Media IDs from upload_media",
        },
        platform_options: platformOptionsProperty,
      },
      required: ["content", "platforms", "scheduled_at"],
      additionalProperties: false,
    },
  },
  {
    name: "get_publish_status",
    description:
      "Check the publishing status of a post using its tracking ID. Returns overall status, per-platform progress, and any errors.",
    inputSchema: {
      type: "object",
      properties: {
        tracking_id: {
          type: "string",
          format: "uuid",
          description: "Tracking ID returned from publish operations",
        },
      },
      required: ["tracking_id"],
      additionalProperties: false,
    },
  },
  {
    name: "suggest_best_platforms",
    description:
      "Analyze post content and recommend which social platforms are the best fit. Considers text length, media presence, and connected accounts. Example: 'Which platforms should I publish this to?'",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Post content to analyze" },
        has_media: { type: "boolean", default: false },
        media_is_video: { type: "boolean", description: "Whether attached media is video" },
        media_type: {
          type: "string",
          enum: ["none", "image", "video", "collection"],
          description: "Explicit content type. Prefer image/video/collection over only toggling has_media.",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);

export type ToolName = (typeof TOOL_NAMES)[number];

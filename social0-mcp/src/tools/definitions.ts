import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { WEBHOOK_EVENTS as webhookEventEnum } from "../types/index.js";

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

const idempotencyKeyProperty = {
  type: "string",
  minLength: 1,
  maxLength: 255,
  description:
    "Optional. Same key = same post: reuse it when retrying this exact call. Without it, an identical call within 10 minutes is treated as a retry.",
} as const;

const platformOptionsProperty = {
  type: "object",
  description:
    "Advanced per-platform settings. Supports content/caption and media per platform, plus pinterest board_id/title/link/create_board, tiktok title/privacy/draft/comment/duet/stitch/commercial/AI flags, instagram cover_image_url/trial_reel, youtube title, and x/twitter_x madeWithAi/paidPartnership.",
  additionalProperties: true,
} as const;

type ToolAnnotations = NonNullable<Tool["annotations"]>;

/** Reads platform or Social0 state; never changes anything. */
const READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
/** Changes Social0 state only (drafts, uploads); nothing leaves the account. */
const LOCAL_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
/** Removes a Social0 draft. */
const LOCAL_DELETE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};
/**
 * Publishes, replies, or moderates on a real network as the user. Hosts use
 * `destructiveHint` + `openWorldHint` to require a confirmation boundary
 * before running these, which matters because inbox reads return text
 * written by strangers in the same session.
 */
const PUBLIC_ACTION: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/** Configures something that sends data to a URL outside Social0 (webhooks). */
const EXTERNAL_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  whoami: READ,
  list_workspaces: READ,
  get_post_events: READ,
  list_webhooks: READ,
  get_webhook: READ,
  list_webhook_deliveries: READ,
  connect_account: LOCAL_WRITE,
  duplicate_post: LOCAL_WRITE,
  disconnect_account: LOCAL_DELETE,
  delete_posts: LOCAL_DELETE,
  cancel_auto_plug: LOCAL_DELETE,
  cancel_auto_repost: LOCAL_DELETE,
  delete_webhook: LOCAL_DELETE,
  post_again: PUBLIC_ACTION,
  set_auto_plug: PUBLIC_ACTION,
  set_auto_repost: PUBLIC_ACTION,
  create_webhook: EXTERNAL_WRITE,
  update_webhook: { ...EXTERNAL_WRITE, destructiveHint: true }, // overwrites URL/events
  test_webhook: EXTERNAL_WRITE,
  list_accounts: READ,
  list_posts: READ,
  get_post: READ,
  get_publish_status: READ,
  suggest_best_platforms: READ,
  get_analytics: READ,
  get_post_analytics: READ,
  list_inbox_comments: READ,
  list_inbox_dms: READ,
  get_inbox_dm_thread: READ,
  create_draft: LOCAL_WRITE,
  update_draft: { ...LOCAL_WRITE, destructiveHint: true }, // overwrites the caption/media
  upload_media: { ...LOCAL_WRITE, openWorldHint: true }, // fetches a public URL
  delete_draft: LOCAL_DELETE,
  publish_post: PUBLIC_ACTION,
  schedule_post: PUBLIC_ACTION,
  publish_now: PUBLIC_ACTION,
  schedule_content: PUBLIC_ACTION,
  reply_to_comment: PUBLIC_ACTION,
  moderate_comment: PUBLIC_ACTION,
  reply_to_dm: PUBLIC_ACTION,
};

export function annotationsFor(name: string): ToolAnnotations | undefined {
  return TOOL_ANNOTATIONS[name];
}

const RAW_TOOL_DEFINITIONS: Tool[] = [
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
      "Create an unpublished Social0 draft (does not post to any network). Use when the user wants to write content first and publish/schedule later. Example: 'Draft a LinkedIn post about AI.'",
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
        idempotency_key: idempotencyKeyProperty,
      },
      required: ["content", "platforms"],
      additionalProperties: false,
    },
  },
  {
    name: "update_draft",
    description:
      "Update an unpublished Social0 draft or scheduled post — caption, platforms, or media. Does not edit already-published live posts.",
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
        idempotency_key: idempotencyKeyProperty,
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
      "Create content and publish it live to connected platforms in one step (writes to external social networks).",
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
        idempotency_key: idempotencyKeyProperty,
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
        idempotency_key: idempotencyKeyProperty,
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
  {
    name: "get_analytics",
    description:
      "Live performance metrics for posts published through Social0 in a date window: totals, per-platform breakdown, daily series, and top posts. Metrics are read from each network at call time. Use when the user asks how their posts are doing, which platform performs best, or for engagement/views numbers. Example: 'How did my posts do last month?'",
    inputSchema: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["7d", "14d", "28d", "90d", "365d", "custom"],
          default: "7d",
          description: "Lookback window. Use custom with since/until.",
        },
        since: { type: "string", description: "ISO 8601 start (range=custom)" },
        until: { type: "string", description: "ISO 8601 end (range=custom)" },
        account: {
          type: "string",
          description: "Connected account UUID or unambiguous platform name",
        },
        fresh: {
          type: "boolean",
          default: false,
          description:
            "Bypass warm cache and re-read the platform APIs. Entries younger than 90s are still served from cache.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_post_analytics",
    description:
      "Live metrics for one Social0 post, broken out per network it was published to. Use after list_posts or get_post when the user asks how a specific post performed.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", format: "uuid", description: "Social0 post ID" },
      },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_inbox_comments",
    description:
      "Read comment threads on posts published through Social0, fetched live from each network. Each thread carries the `comment_id` and `publication_id` needed to reply, like, or hide. Use when the user asks what people are saying, or wants to triage replies. Example: 'Any comments I haven't answered?'",
    inputSchema: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["7d", "14d", "28d", "90d", "365d", "custom"],
          default: "7d",
          description: "Lookback window. Use custom with since/until.",
        },
        since: { type: "string", description: "ISO 8601 start (range=custom)" },
        until: { type: "string", description: "ISO 8601 end (range=custom)" },
        account: {
          type: "string",
          description: "Connected account UUID or unambiguous platform name",
        },
        fresh: {
          type: "boolean",
          default: false,
          description:
            "Bypass warm cache and re-read the platform APIs. Entries younger than 90s are still served from cache.",
        },
        platform: {
          type: "string",
          description: "Limit to one platform (e.g. bluesky, twitter_x, youtube)",
        },
        before: {
          type: "string",
          description: "Cursor from a previous response's next_before",
        },
        limit: { type: "integer", minimum: 1, maximum: 24 },
        unanswered_only: {
          type: "boolean",
          default: false,
          description: "Only threads the connected account has not replied to",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "reply_to_comment",
    description:
      "Post a public reply to a comment on the originating network. Requires both `comment_id` and the `publication_id` from list_inbox_comments — Social0 verifies the comment is on that post before sending. This is a live public action.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: { type: "string", description: "Comment ID from list_inbox_comments" },
        publication_id: {
          type: "string",
          format: "uuid",
          description: "publication_id from the same comment",
        },
        text: { type: "string", description: "Reply text" },
        media_id: {
          type: "string",
          format: "uuid",
          description: "Media upload ID. Only X and Bluesky accept comment attachments.",
        },
      },
      required: ["comment_id", "publication_id", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "moderate_comment",
    description:
      "Like, unlike, or hide a comment. Hiding is Instagram and Facebook Pages only. Requires `publication_id` from list_inbox_comments. Hiding is a moderation action.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: { type: "string", description: "Comment ID from list_inbox_comments" },
        publication_id: {
          type: "string",
          format: "uuid",
          description: "publication_id from the same comment",
        },
        action: { type: "string", enum: ["like", "unlike", "hide"] },
      },
      required: ["comment_id", "publication_id", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "list_inbox_dms",
    description:
      "List direct-message conversations for connected accounts that support DMs (X and Bluesky today). Returns conversation_id + account_id needed to open or reply to a thread.",
    inputSchema: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["7d", "14d", "28d", "90d", "365d", "custom"],
          default: "7d",
          description: "Lookback window. Use custom with since/until.",
        },
        since: { type: "string", description: "ISO 8601 start (range=custom)" },
        until: { type: "string", description: "ISO 8601 end (range=custom)" },
        account: {
          type: "string",
          description: "Connected account UUID or unambiguous platform name",
        },
        fresh: {
          type: "boolean",
          default: false,
          description:
            "Bypass warm cache and re-read the platform APIs. Entries younger than 90s are still served from cache.",
        },
        before: {
          type: "string",
          description: "Cursor from a previous response's next_before",
        },
        limit: { type: "integer", minimum: 1, maximum: 24 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_inbox_dm_thread",
    description:
      "Read the most recent messages in one DM conversation. conversation_id comes from list_inbox_dms. Pass the returned cursor to read older messages.",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string", description: "conversation_id from list_inbox_dms" },
        account: {
          type: "string",
          description: "Connected account UUID or platform name that owns the conversation",
        },
        peer_id: { type: "string", description: "Only needed when the platform omits it" },
        cursor: {
          type: "string",
          description: "Cursor from a previous call, to read older messages",
        },
        fresh: { type: "boolean", default: false },
      },
      required: ["conversation_id", "account"],
      additionalProperties: false,
    },
  },
  {
    name: "reply_to_dm",
    description:
      "Send a message into an existing DM conversation. Social0 verifies the conversation belongs to the account before sending. This delivers a real message to a real person.",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string", description: "conversation_id from list_inbox_dms" },
        account: {
          type: "string",
          description: "Connected account UUID or platform name that owns the conversation",
        },
        text: { type: "string", description: "Message text" },
        peer_id: { type: "string" },
        media_id: {
          type: "string",
          format: "uuid",
          description:
            "Media upload ID. X accepts image and video, TikTok image only, Bluesky text only.",
        },
      },
      required: ["conversation_id", "account", "text"],
      additionalProperties: false,
    },
  },

  {
    name: "whoami",
    description:
      "Show the Social0 user this connection acts as: name, email, plan and timezone. Use when the user asks who they are signed in as or which plan they are on.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_workspaces",
    description:
      "List the team/client workspaces the user belongs to, with their role and permissions in each. Passing a workspace's id as workspace_id scopes the other tools to that team, client or brand. Without workspace_id every tool acts on the user's personal accounts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "connect_account",
    description:
      "Start connecting a social account. Returns an authorization_url: give the link to the user to open and approve in their browser (you cannot complete it), then call list_accounts. X (twitter_x) and Bluesky must be connected from the Social0 dashboard; the server says so.",
    inputSchema: {
      type: "object",
      properties: { platform: { type: "string", enum: [...platformEnum] } },
      required: ["platform"],
      additionalProperties: false,
    },
  },
  {
    name: "disconnect_account",
    description:
      "Disconnect a connected social account from Social0. Its scheduled posts to that account will not go out.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string", format: "uuid", description: "Connected account UUID from list_accounts" },
      },
      required: ["account_id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_posts",
    description:
      "Delete up to 100 draft or scheduled posts in one call. Published posts are not deletable and come back in failed. Returns { deleted, failed: [{ id, error }] }.",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          minItems: 1,
          maxItems: 100,
          description: "Draft or scheduled post IDs",
        },
      },
      required: ["ids"],
      additionalProperties: false,
    },
  },
  {
    name: "duplicate_post",
    description:
      "Copy any post into a new unpublished draft (same text, media and targets). Returns the new draft id.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", format: "uuid", description: "Post to copy" },
        idempotency_key: idempotencyKeyProperty,
      },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "post_again",
    description:
      "Republish a published or partial post as a NEW post, live now, to the same accounts. Returns post_id and tracking_id for get_publish_status. Retrying only the failed accounts on an existing post is publish_post.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", format: "uuid", description: "Published or partial post to repost" },
        idempotency_key: idempotencyKeyProperty,
      },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_auto_plug",
    description:
      "X only (Creator/Agency plans): when a published post reaches a likes or retweets threshold, Social0 replies to it with message. Editable for 24 hours after publishing. Creates or replaces the post's auto-plug.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", format: "uuid" },
        metric: { type: "string", enum: ["likes", "retweets"] },
        threshold: { type: "integer", minimum: 1, maximum: 10000000 },
        message: { type: "string", minLength: 1, maxLength: 280, description: "Reply text posted when the threshold is hit" },
        account_id: { type: "string", format: "uuid", description: "X account, when the post went to more than one" },
      },
      required: ["post_id", "metric", "threshold", "message"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_auto_plug",
    description: "Cancel the pending auto-plug reply on an X post so it is never sent.",
    inputSchema: {
      type: "object",
      properties: { post_id: { type: "string", format: "uuid" } },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_auto_repost",
    description:
      "Turn on or change automatic reposting of a published post: repost every interval_hours, up to max_reposts times, optionally with a message. Returns { post_id, schedule_id }.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", format: "uuid" },
        interval_hours: { type: "number", minimum: 0.5, maximum: 720 },
        max_reposts: { type: "integer", minimum: 1, maximum: 10 },
        message: { type: ["string", "null"], maxLength: 280 },
        active: { type: "boolean", description: "false pauses it" },
      },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_auto_repost",
    description: "Stop automatic reposting of a post. Reposts already published stay up.",
    inputSchema: {
      type: "object",
      properties: { post_id: { type: "string", format: "uuid" } },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_post_events",
    description:
      "Publish timeline for a post: each phase per platform with its message. Use to explain why a post failed or what happened while publishing.",
    inputSchema: {
      type: "object",
      properties: { post_id: { type: "string", format: "uuid" } },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_webhooks",
    description:
      "List the user's webhook endpoints (post.published, post.failed, post.scheduled, post.deleted) with their last delivery result.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_webhook",
    description:
      "Register a public https URL to receive post events. Returns the signing secret once; give it to the user.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        events: { type: "array", items: { type: "string", enum: [...webhookEventEnum] }, minItems: 1 },
      },
      required: ["url", "events"],
      additionalProperties: false,
    },
  },
  {
    name: "get_webhook",
    description: "Get one webhook endpoint: URL, events, active flag and its last delivery result.",
    inputSchema: {
      type: "object",
      properties: { webhook_id: { type: "string", format: "uuid" } },
      required: ["webhook_id"],
      additionalProperties: false,
    },
  },
  {
    name: "update_webhook",
    description: "Change a webhook's URL or events, or pause/resume it with active.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_id: { type: "string", format: "uuid" },
        url: { type: "string", format: "uri" },
        events: { type: "array", items: { type: "string", enum: [...webhookEventEnum] }, minItems: 1 },
        active: { type: "boolean" },
      },
      required: ["webhook_id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_webhook",
    description: "Delete a webhook endpoint. It stops receiving events.",
    inputSchema: {
      type: "object",
      properties: { webhook_id: { type: "string", format: "uuid" } },
      required: ["webhook_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_webhook_deliveries",
    description:
      "Delivery attempts for one webhook, newest first, with response status and error. Use to answer \"did Social0 send it?\". Page with before = next_before.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_id: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        before: { type: "string", description: "next_before from a previous page" },
      },
      required: ["webhook_id"],
      additionalProperties: false,
    },
  },
  {
    name: "test_webhook",
    description: "Send a signed webhook.test ping to the endpoint now and report what it answered.",
    inputSchema: {
      type: "object",
      properties: { webhook_id: { type: "string", format: "uuid" } },
      required: ["webhook_id"],
      additionalProperties: false,
    },
  },
];

/** Account-level tools: their endpoints refuse workspace_id. Every other tool takes it. */
export const ACCOUNT_LEVEL_TOOLS: ReadonlySet<string> = new Set([
  "whoami",
  "list_workspaces",
  "list_webhooks",
  "create_webhook",
  "get_webhook",
  "update_webhook",
  "delete_webhook",
  "list_webhook_deliveries",
  "test_webhook",
]);

const workspaceIdProperty = {
  type: "string",
  format: "uuid",
  description: "Team workspace UUID from list_workspaces. Omit for the user's personal accounts.",
} as const;

export const TOOL_DEFINITIONS: Tool[] = RAW_TOOL_DEFINITIONS.map((tool) => {
  const annotations = annotationsFor(tool.name);
  const scoped = ACCOUNT_LEVEL_TOOLS.has(tool.name)
    ? tool
    : {
        ...tool,
        inputSchema: {
          ...tool.inputSchema,
          properties: { ...tool.inputSchema.properties, workspace_id: workspaceIdProperty },
        },
      };
  // Directory listings (Claude, ChatGPT) want a human title on every tool.
  const title = tool.name.charAt(0).toUpperCase() + tool.name.slice(1).replace(/_/g, " ");
  return { ...scoped, title, annotations: { title, ...annotations } };
});

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);

export type ToolName = (typeof TOOL_NAMES)[number];

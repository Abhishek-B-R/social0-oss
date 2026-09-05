import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createPostInputSchema,
  deletePostInputSchema,
  getAnalyticsOverviewInputSchema,
  getInboxDmThreadInputSchema,
  getPostAnalyticsInputSchema,
  listInboxCommentsInputSchema,
  listInboxDmsInputSchema,
  moderateCommentInputSchema,
  replyToCommentInputSchema,
  replyToDmInputSchema,
  getPostInputSchema,
  getPublishStatusInputSchema,
  listAccountsInputSchema,
  listPostsInputSchema,
  publishNowInputSchema,
  publishPostInputSchema,
  scheduleContentInputSchema,
  schedulePostInputSchema,
  suggestBestPlatformsInputSchema,
  updatePostInputSchema,
  uploadMediaInputSchema,
} from "../schemas/tools.js";
import { TOOL_DEFINITIONS, type ToolName } from "./definitions.js";
import { registerMcpResources } from "../resources.js";
import {
  handleCreatePost,
  handleDeletePost,
  handleGetPost,
  handleGetPublishStatus,
  handleListAccounts,
  handleListPosts,
  handlePublishNow,
  handlePublishPost,
  handleScheduleContent,
  handleSchedulePost,
  handleSuggestBestPlatforms,
  handleUpdatePost,
  handleUploadMedia,
} from "./handlers.js";
import {
  handleGetAnalytics,
  handleGetInboxDmThread,
  handleGetPostAnalytics,
  handleListInboxComments,
  handleListInboxDms,
  handleModerateComment,
  handleReplyToComment,
  handleReplyToDm,
} from "./inbox-handlers.js";

/** Canonical tool names advertised via tools/list. */
const TOOL_SCHEMAS: Record<ToolName, z.ZodTypeAny> = {
  list_accounts: listAccountsInputSchema,
  create_draft: createPostInputSchema,
  update_draft: updatePostInputSchema,
  delete_draft: deletePostInputSchema,
  list_posts: listPostsInputSchema,
  get_post: getPostInputSchema,
  publish_post: publishPostInputSchema,
  schedule_post: schedulePostInputSchema,
  upload_media: uploadMediaInputSchema,
  publish_now: publishNowInputSchema,
  schedule_content: scheduleContentInputSchema,
  get_publish_status: getPublishStatusInputSchema,
  suggest_best_platforms: suggestBestPlatformsInputSchema,
  get_analytics: getAnalyticsOverviewInputSchema,
  get_post_analytics: getPostAnalyticsInputSchema,
  list_inbox_comments: listInboxCommentsInputSchema,
  reply_to_comment: replyToCommentInputSchema,
  moderate_comment: moderateCommentInputSchema,
  list_inbox_dms: listInboxDmsInputSchema,
  get_inbox_dm_thread: getInboxDmThreadInputSchema,
  reply_to_dm: replyToDmInputSchema,
};

/**
 * Deprecated CallTool aliases (not listed in tools/list) so older agents keep working.
 * Prefer the draft_* names — create/update/delete only affect unpublished drafts/schedules.
 */
const TOOL_ALIASES: Record<string, ToolName> = {
  create_post: "create_draft",
  update_post: "update_draft",
  delete_post: "delete_draft",
};

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "input";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}

function resolveToolName(raw: string): ToolName | undefined {
  if (raw in TOOL_SCHEMAS) return raw as ToolName;
  return TOOL_ALIASES[raw];
}

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "social0-mcp",
      version: "0.5.0",
      title: "Social0",
      websiteUrl: "https://social0.app",
      icons: [
        {
          src: "https://social0.app/logo.png",
          mimeType: "image/png",
          sizes: ["any"],
        },
      ],
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  registerMcpResources(server);

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = resolveToolName(request.params.name);
    if (!name) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    const schema = TOOL_SCHEMAS[name];
    if (!schema) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    const parsed = schema.safeParse(request.params.arguments ?? {});
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid input for ${name}:\n${formatZodError(parsed.error)}`,
          },
        ],
        isError: true,
      };
    }

    switch (name) {
      case "list_accounts":
        return handleListAccounts();
      case "create_draft":
        return handleCreatePost(parsed.data);
      case "update_draft":
        return handleUpdatePost(parsed.data);
      case "delete_draft":
        return handleDeletePost(parsed.data);
      case "list_posts":
        return handleListPosts(parsed.data);
      case "get_post":
        return handleGetPost(parsed.data);
      case "publish_post":
        return handlePublishPost(parsed.data);
      case "schedule_post":
        return handleSchedulePost(parsed.data);
      case "upload_media":
        return handleUploadMedia(parsed.data);
      case "publish_now":
        return handlePublishNow(parsed.data);
      case "schedule_content":
        return handleScheduleContent(parsed.data);
      case "get_publish_status":
        return handleGetPublishStatus(parsed.data);
      case "suggest_best_platforms":
        return handleSuggestBestPlatforms(parsed.data);
      case "get_analytics":
        return handleGetAnalytics(parsed.data);
      case "get_post_analytics":
        return handleGetPostAnalytics(parsed.data);
      case "list_inbox_comments":
        return handleListInboxComments(parsed.data);
      case "reply_to_comment":
        return handleReplyToComment(parsed.data);
      case "moderate_comment":
        return handleModerateComment(parsed.data);
      case "list_inbox_dms":
        return handleListInboxDms(parsed.data);
      case "get_inbox_dm_thread":
        return handleGetInboxDmThread(parsed.data);
      case "reply_to_dm":
        return handleReplyToDm(parsed.data);
      default:
        return {
          content: [{ type: "text", text: `Tool not implemented: ${name}` }],
          isError: true,
        };
    }
  });

  return server;
}

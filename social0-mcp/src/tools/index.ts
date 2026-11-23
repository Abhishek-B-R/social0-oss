import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
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
  connectAccountInputSchema,
  createWebhookInputSchema,
  deletePostsInputSchema,
  disconnectAccountInputSchema,
  emptyInputSchema,
  listWebhookDeliveriesInputSchema,
  postActionInputSchema,
  postIdInputSchema,
  setAutoPlugInputSchema,
  setAutoRepostInputSchema,
  updateWebhookInputSchema,
  webhookIdInputSchema,
  workspaceIdSchema,
} from "../schemas/tools.js";

const workspaceInputSchema = z.object({ workspace_id: workspaceIdSchema });
import { runWithWorkspaceId } from "../request-context.js";
import { ACCOUNT_LEVEL_TOOLS, TOOL_DEFINITIONS, type ToolName } from "./definitions.js";
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
  handleCancelAutoPlug,
  handleCancelAutoRepost,
  handleConnectAccount,
  handleCreateWebhook,
  handleDeletePosts,
  handleDeleteWebhook,
  handleDisconnectAccount,
  handleDuplicatePost,
  handleGetPostEvents,
  handleGetWebhook,
  handleListWebhookDeliveries,
  handleListWebhooks,
  handleListWorkspaces,
  handlePostAgain,
  handleSetAutoPlug,
  handleSetAutoRepost,
  handleTestWebhook,
  handleUpdateWebhook,
  handleWhoami,
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
  whoami: emptyInputSchema,
  list_workspaces: emptyInputSchema,
  connect_account: connectAccountInputSchema,
  disconnect_account: disconnectAccountInputSchema,
  delete_posts: deletePostsInputSchema,
  duplicate_post: postActionInputSchema,
  post_again: postActionInputSchema,
  set_auto_plug: setAutoPlugInputSchema,
  cancel_auto_plug: postIdInputSchema,
  set_auto_repost: setAutoRepostInputSchema,
  cancel_auto_repost: postIdInputSchema,
  get_post_events: postIdInputSchema,
  list_webhooks: emptyInputSchema,
  create_webhook: createWebhookInputSchema,
  get_webhook: webhookIdInputSchema,
  update_webhook: updateWebhookInputSchema,
  delete_webhook: webhookIdInputSchema,
  list_webhook_deliveries: listWebhookDeliveriesInputSchema,
  test_webhook: webhookIdInputSchema,
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
      version: "0.6.0",
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

    // workspace_id is read here for every scoped tool, not by handlers: the
    // API client appends it to each request made while this call runs.
    const accountLevel = ACCOUNT_LEVEL_TOOLS.has(name);
    const { workspace_id, ...args } = request.params.arguments ?? {};
    const workspace = workspaceInputSchema.safeParse({ workspace_id: accountLevel ? undefined : workspace_id });
    const parsed = schema.safeParse(accountLevel ? (request.params.arguments ?? {}) : args);
    if (!parsed.success || !workspace.success) {
      const error = workspace.success ? (parsed.error as z.ZodError) : workspace.error;
      return {
        content: [
          {
            type: "text",
            text: `Invalid input for ${name}:\n${formatZodError(error)}`,
          },
        ],
        isError: true,
      };
    }

    return runWithWorkspaceId(workspace.data.workspace_id, () => callTool(name, parsed.data));
  });

  return server;
}

async function callTool(name: ToolName, data: any): Promise<CallToolResult> {
  switch (name) {
    case "list_accounts":
      return handleListAccounts();
    case "create_draft":
      return handleCreatePost(data);
    case "update_draft":
      return handleUpdatePost(data);
    case "delete_draft":
      return handleDeletePost(data);
    case "list_posts":
      return handleListPosts(data);
    case "get_post":
      return handleGetPost(data);
    case "publish_post":
      return handlePublishPost(data);
    case "schedule_post":
      return handleSchedulePost(data);
    case "upload_media":
      return handleUploadMedia(data);
    case "publish_now":
      return handlePublishNow(data);
    case "schedule_content":
      return handleScheduleContent(data);
    case "get_publish_status":
      return handleGetPublishStatus(data);
    case "suggest_best_platforms":
      return handleSuggestBestPlatforms(data);
    case "get_analytics":
      return handleGetAnalytics(data);
    case "get_post_analytics":
      return handleGetPostAnalytics(data);
    case "list_inbox_comments":
      return handleListInboxComments(data);
    case "reply_to_comment":
      return handleReplyToComment(data);
    case "moderate_comment":
      return handleModerateComment(data);
    case "list_inbox_dms":
      return handleListInboxDms(data);
    case "get_inbox_dm_thread":
      return handleGetInboxDmThread(data);
    case "reply_to_dm":
      return handleReplyToDm(data);
    case "whoami":
      return handleWhoami();
    case "list_workspaces":
      return handleListWorkspaces();
    case "connect_account":
      return handleConnectAccount(data);
    case "disconnect_account":
      return handleDisconnectAccount(data);
    case "delete_posts":
      return handleDeletePosts(data);
    case "duplicate_post":
      return handleDuplicatePost(data);
    case "post_again":
      return handlePostAgain(data);
    case "set_auto_plug":
      return handleSetAutoPlug(data);
    case "cancel_auto_plug":
      return handleCancelAutoPlug(data);
    case "set_auto_repost":
      return handleSetAutoRepost(data);
    case "cancel_auto_repost":
      return handleCancelAutoRepost(data);
    case "get_post_events":
      return handleGetPostEvents(data);
    case "list_webhooks":
      return handleListWebhooks();
    case "create_webhook":
      return handleCreateWebhook(data);
    case "get_webhook":
      return handleGetWebhook(data);
    case "update_webhook":
      return handleUpdateWebhook(data);
    case "delete_webhook":
      return handleDeleteWebhook(data);
    case "list_webhook_deliveries":
      return handleListWebhookDeliveries(data);
    case "test_webhook":
      return handleTestWebhook(data);
    default:
      return {
        content: [{ type: "text", text: `Tool not implemented: ${name}` }],
        isError: true,
      };
  }
}

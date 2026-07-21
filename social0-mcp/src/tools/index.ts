import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createPostInputSchema,
  deletePostInputSchema,
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
      version: "0.4.0",
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
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

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
      default:
        return {
          content: [{ type: "text", text: `Tool not implemented: ${name}` }],
          isError: true,
        };
    }
  });

  return server;
}

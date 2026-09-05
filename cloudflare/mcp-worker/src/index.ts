import type { Env } from "./env.js";
import {
  corsPreflight,
  getMcpBaseUrl,
  getOAuthAuthorizationServerMetadata,
  getProtectedResourceMetadata,
  jsonResponse,
  proxyOAuthRequest,
  resolveCredential,
  withCors,
} from "./auth.js";
import { handleMcpRequest, isPublicMcpMethod, peekMcpMethods } from "./mcp.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return corsPreflight();
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    const baseUrl = getMcpBaseUrl(env);

    if (pathname === "/health") {
      return jsonResponse({ ok: true, service: "social0-mcp", ts: new Date().toISOString() });
    }

    if (pathname === "/") {
      return jsonResponse({
        name: "Social0 MCP",
        mcp: `${baseUrl}/mcp`,
        documentation: "https://social0.app/mcp",
        privacy_policy: "https://social0.app/privacy",
        terms_of_service: "https://social0.app/terms",
        icon: "https://social0.app/logo.png",
        oauth: `${baseUrl}/.well-known/oauth-authorization-server`,
      });
    }

    if (pathname === "/.well-known/oauth-authorization-server") {
      return jsonResponse(getOAuthAuthorizationServerMetadata(baseUrl));
    }

    if (pathname === "/.well-known/oauth-protected-resource") {
      return jsonResponse(getProtectedResourceMetadata(baseUrl));
    }

    if (pathname === "/.well-known/oauth-protected-resource/mcp") {
      return jsonResponse(getProtectedResourceMetadata(baseUrl));
    }

    if (
      pathname === "/oauth/authorize" ||
      pathname === "/oauth/token" ||
      pathname === "/oauth/register" ||
      pathname === "/oauth/revoke"
    ) {
      return proxyOAuthRequest(request, env, pathname);
    }

    if (pathname === "/.well-known/mcp" || pathname === "/.well-known/mcp/server-card.json") {
      return jsonResponse({
        name: "Social0 MCP",
        description:
          "Publish and schedule to Instagram, TikTok, YouTube, X, LinkedIn, Facebook, Threads, Bluesky, and Pinterest from Claude, ChatGPT, Cursor, or any MCP host - then read back live metrics, comments, and DMs.",
        version: "0.5.0",
        serverUrl: `${baseUrl}/mcp`,
        documentationUrl: "https://docs.social0.app/docs/integrations/mcp",
        icon: "https://social0.app/logo.png",
        icons: [
          {
            src: "https://social0.app/logo.png",
            mimeType: "image/png",
            sizes: ["any"],
          },
        ],
        tools: [
          { name: "list_accounts", description: "List connected social accounts." },
          { name: "create_draft", description: "Create an unpublished draft." },
          { name: "update_draft", description: "Update an unpublished draft or schedule." },
          { name: "delete_draft", description: "Delete an unpublished draft or schedule." },
          { name: "list_posts", description: "List drafts, scheduled, and published posts." },
          { name: "get_post", description: "Get a post and per-platform publication status." },
          { name: "publish_post", description: "Publish an existing draft immediately." },
          { name: "schedule_post", description: "Schedule an existing draft." },
          { name: "upload_media", description: "Upload image or video media." },
          { name: "publish_now", description: "Create and publish in one step." },
          { name: "schedule_content", description: "Create and schedule in one step." },
          { name: "get_publish_status", description: "Poll a publish job by tracking_id." },
          { name: "suggest_best_platforms", description: "Recommend platforms for a caption." },
          { name: "get_analytics", description: "Live metrics for posts published through Social0." },
          { name: "get_post_analytics", description: "Live metrics for one post, per network." },
          { name: "list_inbox_comments", description: "Read comment threads on published posts." },
          { name: "reply_to_comment", description: "Reply to a comment on the originating network." },
          { name: "moderate_comment", description: "Like, unlike, or hide a comment." },
          { name: "list_inbox_dms", description: "List DM conversations for connected accounts." },
          { name: "get_inbox_dm_thread", description: "Read messages in one DM conversation." },
          { name: "reply_to_dm", description: "Send a message into an existing DM conversation." },
        ],
      });
    }

    if (pathname === "/mcp" && request.method === "GET") {
      const accept = request.headers.get("accept") ?? "";
      if (!accept.includes("text/event-stream")) {
        return jsonResponse({
          name: "Social0 MCP",
          mcp: `${baseUrl}/mcp`,
          transport: "streamable-http",
          documentation: "https://social0.app/mcp",
          oauth: `${baseUrl}/.well-known/oauth-authorization-server`,
        });
      }
    }

    if (pathname === "/mcp") {
      const methods = await peekMcpMethods(request);
      // Only skip auth when every peeked method is discovery-only.
      // Empty/unknown bodies must still require credentials.
      const publicOnly =
        methods.length > 0 && methods.every((method) => isPublicMcpMethod(method));

      const credential = publicOnly
        ? { apiKey: null as string | null }
        : await resolveCredential(request, env);
      if ("error" in credential) {
        return withCors(credential.error);
      }

      try {
        const response = await handleMcpRequest(
          request,
          env,
          "apiKey" in credential ? credential.apiKey : null,
        );
        return withCors(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : "MCP request failed";
        return withCors(jsonResponse({ error: "server_error", error_description: message }, 500));
      }
    }

    return jsonResponse({ error: "not_found" }, 404);
  },
};

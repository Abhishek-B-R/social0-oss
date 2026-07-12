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
import { handleMcpRequest } from "./mcp.js";

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
        oauth: `${baseUrl}/.well-known/oauth-authorization-server`,
      });
    }

    if (pathname === "/.well-known/oauth-authorization-server") {
      return jsonResponse(getOAuthAuthorizationServerMetadata(baseUrl));
    }

    if (pathname === "/.well-known/oauth-protected-resource/mcp") {
      return jsonResponse(getProtectedResourceMetadata(baseUrl));
    }

    if (
      pathname === "/oauth/authorize" ||
      pathname === "/oauth/token" ||
      pathname === "/oauth/register"
    ) {
      return proxyOAuthRequest(request, env, pathname);
    }

    if (pathname === "/mcp") {
      const credential = await resolveCredential(request, env);
      if ("error" in credential) {
        return withCors(credential.error);
      }

      try {
        const response = await handleMcpRequest(request, env, credential.apiKey);
        return withCors(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : "MCP request failed";
        return withCors(jsonResponse({ error: "server_error", error_description: message }, 500));
      }
    }

    return jsonResponse({ error: "not_found" }, 404);
  },
};

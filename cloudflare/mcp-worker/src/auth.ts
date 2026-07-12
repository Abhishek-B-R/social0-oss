import type { Env } from "./env.js";

const MCP_OAUTH_SCOPES = ["social0:read", "social0:write"];

export function getMcpBaseUrl(env: Env): string {
  return (env.MCP_BASE_URL ?? "https://mcp.social0.app").replace(/\/$/, "");
}

export function getOAuthAuthorizationServerMetadata(baseUrl: string) {
  const issuer = baseUrl.replace(/\/$/, "");
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    scopes_supported: MCP_OAUTH_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: "https://social0.app/mcp",
  };
}

export function getProtectedResourceMetadata(baseUrl: string) {
  const resource = `${baseUrl.replace(/\/$/, "")}/mcp`;
  return {
    resource,
    authorization_servers: [baseUrl.replace(/\/$/, "")],
    scopes_supported: MCP_OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Social0 MCP",
    resource_documentation: "https://social0.app/mcp",
    resource_policy_uri: "https://social0.app/privacy",
    resource_tos_uri: "https://social0.app/terms",
  };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export async function resolveCredential(
  request: Request,
  env: Env,
): Promise<{ apiKey: string } | { error: Response }> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: jsonResponse(
        {
          error: "unauthorized",
          error_description: "Missing Bearer token. Connect via OAuth or provide a Social0 API key.",
        },
        401,
        {
          "WWW-Authenticate": `Bearer realm="Social0 MCP", resource_metadata="${getMcpBaseUrl(env)}/.well-known/oauth-protected-resource/mcp"`,
        },
      ),
    };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return {
      error: jsonResponse({ error: "unauthorized", error_description: "Empty Bearer token" }, 401),
    };
  }

  const apiBase = env.API_BASE_URL.replace(/\/$/, "");
  const introspect = await fetch(`${apiBase}/oauth/mcp/introspect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MCP_OAUTH_INTROSPECT_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  if (!introspect.ok) {
    return {
      error: jsonResponse(
        { error: "server_error", error_description: "Token introspection failed" },
        503,
      ),
    };
  }

  const payload = (await introspect.json()) as { active?: boolean; api_key?: string };
  if (!payload.active || !payload.api_key) {
    return {
      error: jsonResponse(
        { error: "invalid_token", error_description: "Token is inactive or expired" },
        401,
      ),
    };
  }

  return { apiKey: payload.api_key };
}

export async function proxyOAuthRequest(request: Request, env: Env, path: string): Promise<Response> {
  const apiBase = env.API_BASE_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  const target = `${apiBase}${path}${url.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const upstream = await fetch(target, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

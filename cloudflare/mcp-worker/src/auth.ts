import type { Env } from "./env.js";

/**
 * Must equal MCP_OAUTH_SCOPES in backend/server/src/lib/mcp-oauth.ts, which
 * is what the authorization server grants (v1-scopes.test.ts checks).
 */
const MCP_OAUTH_SCOPES = [
  "social0:read",
  "social0:write",
  "me:read",
  "accounts:read",
  "accounts:write",
  "posts:read",
  "posts:write",
  "media:write",
  "jobs:read",
  "analytics:read",
  "inbox:read",
  "inbox:write",
  "webhooks:read",
  "webhooks:write",
];

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
    revocation_endpoint: `${issuer}/oauth/revoke`,
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
    resource_icon: "https://social0.app/logo.png",
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

/**
 * What the worker calls `/v1` with: the caller's own bearer token (an OAuth
 * access token or an API key) plus this worker's signature over it. The API
 * accepts an OAuth token only with that signature, and introspection never
 * hands out a credential, so no raw API key passes through the worker.
 */
export type McpCredential = {
  token: string;
  proxySignature: string;
  clientName: string | null;
};

/**
 * Active introspection results, by token hash, for this isolate. Each tool
 * call introspected its token and then `/v1` resolved it again; `/v1` still
 * validates the forwarded token on every call (so a revoke takes effect
 * there at once), which makes reusing an "active" answer for a minute safe.
 * Inactive answers are never cached.
 */
export const INTROSPECTION_CACHE_TTL_MS = 60_000;
const INTROSPECTION_CACHE_MAX = 5_000;
type IntrospectionPayload = { active?: boolean; client_name?: string; api_key?: string; exp?: number };
const introspectionCache = new Map<string, { payload: IntrospectionPayload; until: number }>();

function cachedIntrospection(key: string): IntrospectionPayload | null {
  const hit = introspectionCache.get(key);
  if (!hit) return null;
  if (hit.until <= Date.now()) {
    introspectionCache.delete(key);
    return null;
  }
  return hit.payload;
}

function rememberIntrospection(key: string, payload: IntrospectionPayload): void {
  if (!payload.active) return;
  const expMs = typeof payload.exp === "number" ? payload.exp * 1000 : Infinity;
  const until = Math.min(Date.now() + INTROSPECTION_CACHE_TTL_MS, expMs);
  if (until <= Date.now()) return;
  if (introspectionCache.size >= INTROSPECTION_CACHE_MAX) {
    const oldest = introspectionCache.keys().next();
    if (!oldest.done) introspectionCache.delete(oldest.value);
  }
  introspectionCache.set(key, { payload, until });
}

/** Test hook. */
export function clearIntrospectionCache(): void {
  introspectionCache.clear();
}

export async function resolveCredential(
  request: Request,
  env: Env,
): Promise<McpCredential | { error: Response }> {
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

  const cacheKey = await sha256Hex(token);
  const cached = cachedIntrospection(cacheKey);
  if (cached) return credentialFrom(token, cached, env);

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

  // `api_key` only comes from an API older than this worker (the raw
  // connector key): used as before when present, so the worker can be
  // deployed first with no downtime. Remove once the API is deployed.
  const payload = (await introspect.json()) as IntrospectionPayload;
  if (!payload.active) {
    // The challenge tells MCP hosts to refresh: access tokens last an hour.
    return {
      error: jsonResponse(
        { error: "invalid_token", error_description: "Token is inactive or expired" },
        401,
        {
          "WWW-Authenticate": `Bearer realm="Social0 MCP", error="invalid_token", resource_metadata="${getMcpBaseUrl(env)}/.well-known/oauth-protected-resource/mcp"`,
        },
      ),
    };
  }

  rememberIntrospection(cacheKey, payload);
  return credentialFrom(token, payload, env);
}

async function credentialFrom(
  token: string,
  payload: IntrospectionPayload,
  env: Env,
): Promise<McpCredential> {
  const forwarded = payload.api_key ?? token;
  return {
    token: forwarded,
    proxySignature: await signProxyToken(forwarded, env.MCP_OAUTH_INTROSPECT_SECRET),
    clientName: headerSafeClientName(payload.client_name),
  };
}

/**
 * Header the API checks before it accepts a forwarded OAuth token. Must match
 * MCP_PROXY_TOKEN_SIGNATURE_HEADER and signMcpProxyToken in
 * backend/server/src/lib/mcp-oauth.ts.
 */
export const PROXY_TOKEN_SIGNATURE_HEADER = "x-social0-mcp-proxy";
const PROXY_TOKEN_CONTEXT = "social0-mcp-proxy:";

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** base64url(HMAC-SHA256(secret, "social0-mcp-proxy:" + sha256hex(token))). */
export async function signProxyToken(token: string, secret: string): Promise<string> {
  return hmacBase64Url(secret, `${PROXY_TOKEN_CONTEXT}${await sha256Hex(token)}`);
}

async function hmacBase64Url(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** OAuth client_name as a header value: printable ASCII, trimmed, ≤ 80 chars. */
function headerSafeClientName(name: string | undefined): string | null {
  if (typeof name !== "string") return null;
  const clean = name.replace(/[^\x20-\x7E]/g, "").trim().slice(0, 80);
  return clean || null;
}

/** OAuth register/token/revoke payloads are tiny; keep well under API bodyLimit (1 MB). */
export const OAUTH_PROXY_BODY_LIMIT_BYTES = 64 * 1024;

function limitedRequestBody(body: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > limit) {
          controller.error(new Error("oauth_body_too_large"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * The API rate-limits the unauthenticated OAuth routes per caller, but every
 * proxied request reaches it from this worker's address. So the worker
 * forwards the caller's address, signed with the shared introspect secret so a
 * direct caller to the API cannot pick its own bucket. Must match
 * MCP_PROXY_CLIENT_IP_* and signMcpProxyClientIp in
 * backend/server/src/lib/mcp-oauth.ts.
 */
export const CLIENT_IP_HEADER = "x-social0-client-ip";
export const CLIENT_IP_SIGNATURE_HEADER = "x-social0-client-ip-signature";
const CLIENT_IP_CONTEXT = "social0-mcp-client-ip:";

/** base64url(HMAC-SHA256(secret, "social0-mcp-client-ip:" + ip)). */
export async function signClientIp(ip: string, secret: string): Promise<string> {
  return hmacBase64Url(secret, `${CLIENT_IP_CONTEXT}${ip}`);
}

export async function proxyOAuthRequest(request: Request, env: Env, path: string): Promise<Response> {
  const apiBase = env.API_BASE_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  const target = `${apiBase}${path}${url.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  // Cloudflare sets CF-Connecting-IP itself; a client cannot supply it.
  const callerIp = request.headers.get("cf-connecting-ip")?.trim();
  if (callerIp && env.MCP_OAUTH_INTROSPECT_SECRET) {
    headers.set(CLIENT_IP_HEADER, callerIp);
    headers.set(
      CLIENT_IP_SIGNATURE_HEADER,
      await signClientIp(callerIp, env.MCP_OAUTH_INTROSPECT_SECRET),
    );
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader !== null) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > OAUTH_PROXY_BODY_LIMIT_BYTES) {
        return withCors(
          jsonResponse(
            {
              error: "invalid_request",
              error_description: `Request body must be at most ${OAUTH_PROXY_BODY_LIMIT_BYTES} bytes`,
            },
            413,
          ),
        );
      }
      headers.set("content-length", String(contentLength));
    }

    if (!request.body) {
      init.body = null;
    } else {
      // Stream through — never buffer the full body in the Worker isolate.
      init.body = limitedRequestBody(request.body, OAUTH_PROXY_BODY_LIMIT_BYTES);
      init.duplex = "half";
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    if (error instanceof Error && /oauth_body_too_large/.test(error.message)) {
      return withCors(
        jsonResponse(
          {
            error: "invalid_request",
            error_description: `Request body must be at most ${OAUTH_PROXY_BODY_LIMIT_BYTES} bytes`,
          },
          413,
        ),
      );
    }
    throw error;
  }

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

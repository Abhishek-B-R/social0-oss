import type { FastifyRequest } from "fastify";

/** Public MCP OAuth endpoints (Worker proxies these without a browser Origin). */
export function isMcpOAuthPublicPath(path: string): boolean {
  return (
    path === "/oauth/register" ||
    path === "/oauth/token" ||
    path === "/oauth/revoke" ||
    path === "/oauth/authorize" ||
    path === "/oauth/mcp/introspect" ||
    path.startsWith("/.well-known/oauth-authorization-server") ||
    path.startsWith("/.well-known/oauth-protected-resource")
  );
}

/** Browser origins Claude uses when talking to MCP OAuth endpoints. */
export function isMcpOAuthCorsOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "claude.ai" || host.endsWith(".claude.ai");
  } catch {
    return false;
  }
}

/**
 * Requests that legitimately have no Origin header in production:
 * - GET/HEAD browser navigations (OAuth callbacks, connect, email links)
 * - Cloudflare / uptime probes hitting GET /health
 * - Bearer-authenticated `/api/cron/*` (CF cron worker, curl, crontab)
 * - `/v1/*` public API (curl, Postman, server-side integrations — API key auth, not browser CORS)
 * - MCP OAuth register/token/revoke/introspect proxied from mcp.social0.app Worker (no Origin)
 *
 * Cross-origin fetch from the SPA (POST, PUT, …) always sends Origin, so we
 * still reject missing Origin on other mutating `/api/*` routes.
 */
export function allowsMissingCorsOrigin(req: FastifyRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const path = req.url.split("?")[0] ?? "";
  if (path.startsWith("/api/cron/")) return true;
  if (path.startsWith("/v1/")) return true;
  if (isMcpOAuthPublicPath(path)) return true;
  return false;
}

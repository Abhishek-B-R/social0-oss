import type { FastifyRequest } from "fastify";

/**
 * Requests that legitimately have no Origin header in production:
 * - GET/HEAD browser navigations (OAuth callbacks, connect, email links)
 * - Cloudflare / uptime probes hitting GET /health
 * - Bearer-authenticated `/api/cron/*` (CF cron worker, curl, crontab)
 * - `/v1/*` public API (curl, Postman, server-side integrations — API key auth, not browser CORS)
 *
 * Cross-origin fetch from the SPA (POST, PUT, …) always sends Origin, so we
 * still reject missing Origin on other mutating `/api/*` routes.
 */
export function allowsMissingCorsOrigin(req: FastifyRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const path = req.url.split("?")[0] ?? "";
  if (path.startsWith("/api/cron/")) return true;
  if (path.startsWith("/v1/")) return true;
  return false;
}

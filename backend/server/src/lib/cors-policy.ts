import type { FastifyRequest } from "fastify";

/**
 * Requests that legitimately have no Origin header in production:
 * - GET/HEAD browser navigations (OAuth callbacks, connect, email links)
 * - Cloudflare / uptime probes hitting GET /health
 * - Bearer-authenticated `/api/cron/*` (CF cron worker, curl, crontab)
 *
 * Cross-origin fetch from the SPA (POST, PUT, …) always sends Origin, so we
 * still reject missing Origin on other mutating methods.
 */
export function allowsMissingCorsOrigin(req: FastifyRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const path = req.url.split("?")[0] ?? "";
  if (path.startsWith("/api/cron/")) return true;
  return false;
}

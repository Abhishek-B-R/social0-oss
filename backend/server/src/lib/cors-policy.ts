import type { FastifyRequest } from "fastify";

/**
 * Requests that legitimately have no Origin header in production:
 * - GET/HEAD browser navigations (OAuth callbacks, connect, email links)
 * - Cloudflare / uptime probes hitting GET /health
 *
 * Cross-origin fetch from the SPA (POST, PUT, …) always sends Origin, so we
 * still reject missing Origin on mutating methods.
 */
export function allowsMissingCorsOrigin(req: FastifyRequest): boolean {
  return req.method === "GET" || req.method === "HEAD";
}

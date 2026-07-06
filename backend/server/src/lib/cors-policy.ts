import type { FastifyRequest } from "fastify";

/**
 * Browser OAuth redirects (connect, Better Auth callbacks, email links) are
 * top-level GET navigations and do not send an Origin header. Production CORS
 * must allow these without throwing — fetch/XHR from the SPA always sends Origin.
 */
export function allowsMissingCorsOrigin(req: FastifyRequest): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const path = req.url.split("?")[0] ?? "";
  return (
    path.startsWith("/api/connect/") ||
    path.startsWith("/api/auth/")
  );
}

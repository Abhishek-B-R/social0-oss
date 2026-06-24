import type { FastifyRequest } from "fastify";

/** Public origin for the incoming request (honours Vite/nginx forwarded headers). */
export function forwardedRequestOrigin(req: FastifyRequest): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ??
    req.headers.host ??
    "localhost";
  return `${proto}://${host}`;
}

export function buildForwardedRequestUrl(req: FastifyRequest): string {
  return `${forwardedRequestOrigin(req)}${req.url}`;
}

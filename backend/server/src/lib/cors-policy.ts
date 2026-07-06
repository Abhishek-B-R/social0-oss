/**
 * Resolve CORS for @fastify/cors origin callback.
 * Missing Origin = top-level browser navigation (OAuth redirect) — skip CORS headers, do not 500.
 */
export function resolveCorsOrigin(
  origin: string | undefined,
  allowedOrigins: string[],
): true | false | Error {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  return new Error("CORS origin not allowed");
}

import type { AppRequest } from "./shim/http.js";

/**
 * Next.js App Router issues many requests per user-visible navigation (RSC flights,
 * prefetches, layout segments). Only full document loads should count toward the
 * edge page rate limit - otherwise a few refreshes exhaust the quota.
 */
export function isFullPageDocumentRequest(req: AppRequest): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  if (req.headers.get("rsc") === "1") return false;
  if (req.headers.get("next-router-prefetch")) return false;
  if (req.headers.get("next-router-state-tree")) return false;
  if (req.headers.get("purpose") === "prefetch") return false;

  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/x-component")) return false;

  return accept.includes("text/html");
}

/** Better Auth session polling / RSC-adjacent calls - higher cap than document loads. */
export function isAuthSessionPoll(req: AppRequest): boolean {
  const path = req.nextUrl.pathname;
  return (
    path.endsWith("/get-session") ||
    path.endsWith("/session") ||
    path.includes("/subscription-check")
  );
}

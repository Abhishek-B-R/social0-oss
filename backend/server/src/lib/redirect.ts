import { appUrlForPath } from "./app-url.js";
import { redirect } from "./shim/route-redirect.js";
import { sanitizeReturnToPath } from "./safe-return-to.js";

/** Redirect only to a safe in-app path on the frontend origin. */
export function safeRedirect(
  url: unknown,
  fallback: string,
  request?: Request,
): never {
  const fallbackSafe = sanitizeReturnToPath(fallback) ?? "/dashboard";
  const s = sanitizeReturnToPath(url) ?? fallbackSafe;
  return redirect(appUrlForPath(s, request));
}

/** Rethrow route redirect errors so they propagate; call at the start of catch blocks. */
export function rethrowRouteRedirect(err: unknown): void {
  if ((err as { digest?: string })?.digest?.startsWith("ROUTE_REDIRECT")) {
    throw err;
  }
  if (err instanceof Error && err.message === "ROUTE_REDIRECT") {
    throw err;
  }
}

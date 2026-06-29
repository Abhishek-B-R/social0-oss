import { redirect } from "@/lib/router";
import { sanitizeReturnToPath } from "@/lib/safe-return-to";

/** Redirect only to a safe in-app relative path. External URLs are rejected. */
export function safeRedirect(url: unknown, fallback: string): never {
  const fallbackSafe = sanitizeReturnToPath(fallback) ?? "/dashboard";
  const s = sanitizeReturnToPath(url) ?? fallbackSafe;
  return redirect(s);
}

/** Rethrow route redirect errors so they propagate. */
export function rethrowRouteRedirect(err: unknown): void {
  if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
    throw err;
  }
  if (err instanceof Error && err.message.startsWith("REDIRECT:")) {
    throw err;
  }
}

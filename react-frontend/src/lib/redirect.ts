import { sanitizeReturnToPath } from "@/lib/safe-return-to";

/** Redirect only to a safe in-app relative path. External URLs are rejected. */
export function safeRedirect(url: unknown, fallback: string): never {
  const fallbackSafe = sanitizeReturnToPath(fallback) ?? "/dashboard";
  const s = sanitizeReturnToPath(url) ?? fallbackSafe;
  if (typeof window !== "undefined") {
    window.location.assign(s);
  }
  throw new Error(`REDIRECT:${s}`);
}

/** Rethrow route redirect errors so they propagate. */
export function rethrowRouteRedirect(err: unknown): void {
  if (err instanceof Error && err.message.startsWith("REDIRECT:")) {
    throw err;
  }
}

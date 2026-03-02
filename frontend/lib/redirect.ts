import { redirect } from "next/navigation";

/** Ensure we only ever redirect to a string URL. Passing an object (e.g. from state/callbackUrl) would 404. */
export function safeRedirect(url: unknown, fallback: string): never {
  const s =
    typeof url === "string" &&
    url.trim().length > 0 &&
    (url.startsWith("/") || url.startsWith("http"))
      ? url.trim()
      : fallback;
  return redirect(s);
}

/** Rethrow Next.js redirect errors so they propagate; call at the start of catch blocks in API routes. */
export function rethrowNextRedirect(err: unknown): void {
  if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
    throw err;
  }
  if (err instanceof Error && err.message === "NEXT_REDIRECT") {
    throw err;
  }
}

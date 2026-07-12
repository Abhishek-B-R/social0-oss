import { getAppUrl } from "./env";
import { sanitizeReturnToPath } from "@social0/shared";

const DEFAULT_CALLBACK = "/dashboard/composer";

/** Build a sign-in URL that returns the user to `callbackPath` after auth. */
export function signInUrl(callbackPath?: string): string {
  const path =
    sanitizeReturnToPath(callbackPath) ?? DEFAULT_CALLBACK;
  return `/auth?callbackUrl=${encodeURIComponent(path)}`;
}

/** Resolve callbackUrl from search params; only same-origin paths allowed. */
export function resolveCallbackUrl(
  raw: string | string[] | null | undefined,
  fallback = DEFAULT_CALLBACK,
): string {
  const s =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return sanitizeReturnToPath(s) ?? fallback;
}

/** Better Auth resolves relative callbackURL against the API host — must be the SPA origin. */
export function absoluteCallbackUrl(path: string): string {
  const safe = sanitizeReturnToPath(path) ?? DEFAULT_CALLBACK;
  const base = getAppUrl().replace(/\/$/, "");
  return `${base}${safe}`;
}

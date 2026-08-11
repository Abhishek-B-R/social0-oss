import { getAppUrl } from "./env";
import { sanitizeReturnToPath } from "./safe-return-to";

/** Post-auth gate: hold here until onboarding status decides destination. */
export const AUTH_CONTINUE_PATH = "/auth/continue";

/** Build continue path, optionally preserving where the user wanted to go. */
export function authContinuePath(returnTo?: string | null): string {
  const safe = sanitizeReturnToPath(returnTo);
  if (
    !safe ||
    safe === AUTH_CONTINUE_PATH ||
    safe.startsWith(`${AUTH_CONTINUE_PATH}?`)
  ) {
    return AUTH_CONTINUE_PATH;
  }
  return `${AUTH_CONTINUE_PATH}?returnTo=${encodeURIComponent(safe)}`;
}

/** Build a sign-in URL that returns through the continue gate after auth. */
export function signInUrl(callbackPath?: string): string {
  const path = authContinuePath(callbackPath);
  return `/auth?callbackUrl=${encodeURIComponent(path)}`;
}

/** Resolve callbackUrl from search params; only same-origin paths allowed. */
export function resolveCallbackUrl(
  raw: string | string[] | null | undefined,
  fallback = AUTH_CONTINUE_PATH,
): string {
  const s =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return sanitizeReturnToPath(s) ?? fallback;
}

/** Better Auth resolves relative callbackURL against the API host — must be the SPA origin. */
export function absoluteCallbackUrl(path: string): string {
  const safe = sanitizeReturnToPath(path) ?? AUTH_CONTINUE_PATH;
  const base = getAppUrl().replace(/\/$/, "");
  return `${base}${safe}`;
}

/**
 * Pick dashboard vs onboarding (or a preserved deep link) after auth data loads.
 */
export function resolvePostAuthDestination(
  status: { shouldOnboard: boolean },
  returnTo?: string | null,
): string {
  const preferred = sanitizeReturnToPath(returnTo);

  if (status.shouldOnboard) {
    if (preferred?.startsWith("/invite/")) return preferred;
    if (preferred?.startsWith("/onboarding")) return preferred;
    return "/onboarding";
  }

  if (
    preferred &&
    !preferred.startsWith(AUTH_CONTINUE_PATH) &&
    preferred !== "/auth" &&
    !preferred.startsWith("/auth?") &&
    !preferred.startsWith("/onboarding")
  ) {
    return preferred;
  }

  return "/dashboard";
}

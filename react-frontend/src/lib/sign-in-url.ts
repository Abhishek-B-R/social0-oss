const DEFAULT_CALLBACK = "/dashboard/composer";

/** Build a sign-in URL that returns the user to `callbackPath` after auth. */
export function signInUrl(callbackPath?: string): string {
  const path =
    callbackPath &&
    callbackPath.startsWith("/") &&
    !callbackPath.startsWith("//")
      ? callbackPath
      : DEFAULT_CALLBACK;
  return `/auth?callbackUrl=${encodeURIComponent(path)}`;
}

/** Resolve callbackUrl from search params; only same-origin paths allowed. */
export function resolveCallbackUrl(
  raw: string | string[] | null | undefined,
  fallback = DEFAULT_CALLBACK,
): string {
  const s =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (s && s.startsWith("/") && !s.startsWith("//")) return s;
  return fallback;
}

const SENSITIVE_PARAMS = new Set([
  "token",
  "code",
  "state",
  "message",
  "access_token",
  "refresh_token",
]);

/** Strip sensitive query params before sending URLs to analytics. */
export function sanitizeAnalyticsUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Remove OAuth connect token from the address bar after it has been read. */
export function stripSensitiveQueryParams(
  keys: string[] = ["token"],
): void {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of keys) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch {
    // ignore
  }
}

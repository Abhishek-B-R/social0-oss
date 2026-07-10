const BUILD_KEY = "social0-app-build";
const THEME_KEY = "theme";
const RELOAD_ATTEMPT = "social0-build-reload-attempt";

/** Clear stale client caches after a new deploy; keep theme preference. */
export function syncAppBuild(): boolean {
  if (typeof window === "undefined") return true;

  const current = import.meta.env.VITE_APP_BUILD_ID?.trim();
  if (!current) return true;

  try {
    const stored = localStorage.getItem(BUILD_KEY);
    if (stored === current) {
      sessionStorage.removeItem(RELOAD_ATTEMPT);
      return true;
    }

    if (sessionStorage.getItem(RELOAD_ATTEMPT) === current) {
      localStorage.setItem(BUILD_KEY, current);
      sessionStorage.removeItem(RELOAD_ATTEMPT);
      return true;
    }

    const theme = localStorage.getItem(THEME_KEY);
    localStorage.clear();
    if (theme) localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(BUILD_KEY, current);
    sessionStorage.setItem(RELOAD_ATTEMPT, current);
    window.location.reload();
    return false;
  } catch {
    return true;
  }
}

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically imported module/i;

/** Reload once when Vite/chunk assets are stale after a deploy. */
export function registerStaleAssetRecovery(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    window.location.reload();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "";
    if (!CHUNK_ERROR.test(message)) return;
    event.preventDefault();
    window.location.reload();
  });
}

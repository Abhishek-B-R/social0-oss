const BUILD_KEY = "social0-app-build";
const THEME_KEY = "theme";
const RELOAD_ATTEMPT = "social0-build-reload-attempt";
const CHUNK_RELOAD_ATTEMPT = "social0-chunk-reload-attempt";

/** Prefixes preserved across deploy cache clears (auth is cookie-based). */
const PRESERVE_LS_PREFIXES = ["social0.", "social0-"] as const;

let chunkReloadAttempted = false;

function preserveLocalStorageKeys(): Map<string, string> {
  const kept = new Map<string, string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key === THEME_KEY ||
        key === BUILD_KEY ||
        PRESERVE_LS_PREFIXES.some((p) => key.startsWith(p))
      ) {
        const value = localStorage.getItem(key);
        if (value != null) kept.set(key, value);
      }
    }
  } catch {
    // ignore
  }
  return kept;
}

/** Clear stale client caches after a new deploy; keep theme + workspace prefs. */
export function syncAppBuild(): boolean {
  if (typeof window === "undefined") return true;

  const current = import.meta.env.VITE_APP_BUILD_ID?.trim();
  if (!current) return true;

  try {
    const stored = localStorage.getItem(BUILD_KEY);
    if (stored === current) {
      sessionStorage.removeItem(RELOAD_ATTEMPT);
      // Do NOT clear CHUNK_RELOAD_ATTEMPT here — that re-arms infinite reloads
      // when a poisoned /assets/* cache keeps failing after the shell loads.
      return true;
    }

    if (sessionStorage.getItem(RELOAD_ATTEMPT) === current) {
      localStorage.setItem(BUILD_KEY, current);
      sessionStorage.removeItem(RELOAD_ATTEMPT);
      // New build settled — allow one chunk recovery for this deploy.
      sessionStorage.removeItem(CHUNK_RELOAD_ATTEMPT);
      chunkReloadAttempted = false;
      return true;
    }

    const kept = preserveLocalStorageKeys();
    localStorage.clear();
    for (const [key, value] of kept) {
      localStorage.setItem(key, value);
    }
    localStorage.setItem(BUILD_KEY, current);
    sessionStorage.setItem(RELOAD_ATTEMPT, current);
    // New deploy — allow one chunk recovery attempt.
    sessionStorage.removeItem(CHUNK_RELOAD_ATTEMPT);
    chunkReloadAttempted = false;
    window.location.reload();
    return false;
  } catch {
    return true;
  }
}

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically imported module|Failed to load module script|MIME type of ["']?text\/html/i;

function reloadOnceForStaleChunk(): void {
  if (chunkReloadAttempted) return;
  chunkReloadAttempted = true;

  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_ATTEMPT) === "1") {
      // Already reloaded once this tab — avoid an infinite reload loop when
      // a missing /assets/* URL still serves HTML (or a poisoned cache).
      return;
    }
    sessionStorage.setItem(CHUNK_RELOAD_ATTEMPT, "1");
  } catch {
    // sessionStorage blocked — module flag above still prevents a loop.
  }
  window.location.reload();
}

/** Reload at most once when Vite/chunk assets are stale after a deploy. */
export function registerStaleAssetRecovery(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnceForStaleChunk();
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
    reloadOnceForStaleChunk();
  });
}

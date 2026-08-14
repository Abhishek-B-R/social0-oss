type PostHogRefClient = {
  register: (properties: Record<string, string>) => void;
  register_once: (properties: Record<string, string>) => void;
};

const REF_STORAGE_KEY = "s0_ref";
const MAX_REF_LEN = 64;

/** Normalize ?ref= values for consistent PostHog breakdowns. */
export function normalizeRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, MAX_REF_LEN);
  if (!trimmed || !/^[\w.-]+$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/** Persist ref from the query string (session-scoped first touch). */
export function captureRefFromSearch(search: string): string | null {
  try {
    const ref = normalizeRef(new URLSearchParams(search).get("ref"));
    if (ref) sessionStorage.setItem(REF_STORAGE_KEY, ref);
    return ref;
  } catch {
    return null;
  }
}

export function getStoredRef(): string | null {
  try {
    return normalizeRef(sessionStorage.getItem(REF_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Attach ref to all events + first-touch person property. */
export function applyRefToPostHog(posthog: PostHogRefClient): void {
  const ref = getStoredRef();
  if (!ref) return;
  posthog.register({ ref });
  posthog.register_once({ initial_ref: ref });
}

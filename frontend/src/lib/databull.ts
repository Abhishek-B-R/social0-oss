/**
 * DataBull visitor/session ids, read from the cookies its script sets on
 * social0.app. Server-created Dodo checkouts need these in metadata so the
 * sale is attributed to the visitor; the API runs on another subdomain and
 * never sees these host-only cookies, so the SPA forwards them in the body.
 */
function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]+)"),
  );
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function databullAttribution(): {
  databullVisitorId?: string;
  databullSessionId?: string;
} {
  return {
    databullVisitorId: readCookie("datacheap_visitor_id"),
    databullSessionId: readCookie("datacheap_session_id"),
  };
}

type GoalFn = ((name: string, props?: Record<string, string>) => void) & {
  q?: unknown[][];
};

/**
 * Record a DataBull goal (shown under Goal/Funnel). The script is deferred, so
 * before it loads calls go into `datacheap.q`, which it replays on load.
 */
export function databullGoal(name: string, props?: Record<string, string>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { datacheap?: GoalFn };
  try {
    if (!w.datacheap) {
      const stub: GoalFn = (...args) => {
        (stub.q ??= []).push(args);
      };
      w.datacheap = stub;
    }
    w.datacheap(name, props);
  } catch {
    // Analytics must never break the app.
  }
}

const SIGNUP_WINDOW_MS = 15 * 60 * 1000;

/** Fire the `signup` goal once for an account created in the last 15 minutes. */
export function trackSignupOnce(user: { id: string; createdAt?: Date | string | null }): void {
  if (!user.createdAt) return;
  const created = new Date(user.createdAt).getTime();
  if (!Number.isFinite(created) || Date.now() - created > SIGNUP_WINDOW_MS) return;
  const key = `s0_signup_goal_${user.id}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // Storage blocked: still record it; a repeat is better than none.
  }
  databullGoal("signup");
}

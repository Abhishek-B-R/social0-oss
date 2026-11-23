import { assignSafeRedirectUrl } from "@/lib/safe-external-url";

const PLAN_LIMIT_MESSAGE =
  "You need an active plan to connect accounts and post content.";
const FORBIDDEN_MESSAGE =
  "You can’t connect accounts here. Switch back to the workspace you started from, or ask a workspace admin for access.";

/** Handle account-picker POST: API returns JSON redirectUrl (split deploy). */
export async function completeConnectSelect(
  res: Response,
  fallbackReturnTo: string,
): Promise<void> {
  if (res.status === 403) {
    // 403 is either the plan limit (`limit_reached`) or a permission problem
    // (no manage_connections, or the OAuth token belongs to another
    // workspace owner). Only the first one is about buying a plan.
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (data.message) throw new Error(data.message);
    if (data.error === "limit_reached") throw new Error(PLAN_LIMIT_MESSAGE);
    throw new Error(
      data.error && data.error !== "Unauthorized" && data.error !== "Forbidden"
        ? data.error
        : FORBIDDEN_MESSAGE,
    );
  }

  // Same-origin Next.js monolith may still HTTP-redirect.
  if (res.redirected) {
    if (!assignSafeRedirectUrl(res.url)) {
      throw new Error("Connection could not complete. Please try again.");
    }
    return;
  }

  const data = (await res.json().catch(() => ({}))) as {
    redirectUrl?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? "Failed to connect");
  }

  const target = data.redirectUrl ?? fallbackReturnTo;
  if (!assignSafeRedirectUrl(target)) {
    throw new Error("Connection could not complete. Please try again.");
  }
}

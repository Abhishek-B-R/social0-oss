import { auth } from "@/lib/auth";
import { safeRedirect } from "@/lib/redirect";
import { verifyOAuthConnectBinding } from "@/lib/oauth-connect-binding";

/**
 * OAuth callbacks must match the user who started the connect flow.
 * Prevents CSRF account linking (victim authorizes → attacker's Social0 user).
 *
 * Accepts either an active session or the short-lived oauth_connect_binding cookie
 * set when connect was initiated in the same browser.
 */
export async function assertOAuthCallbackSession(
  request: Request,
  expectedUserId: string,
  platform: string,
): Promise<void> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user?.id === expectedUserId) {
    return;
  }

  if (verifyOAuthConnectBinding(request, expectedUserId, platform)) {
    return;
  }

  safeRedirect(
    `/dashboard/connections?error=oauth_session_mismatch&platform=${encodeURIComponent(platform)}`,
    "/dashboard/connections",
  );
}

import { auth } from "@/lib/auth";
import { safeRedirect } from "@/lib/redirect";
import {
  clearOAuthConnectBinding,
  verifyOAuthConnectBinding,
} from "@/lib/oauth-connect-binding";

/**
 * OAuth callbacks must match the user who started the connect flow.
 * Prevents CSRF account linking (victim authorizes → attacker's Social0 user).
 */
export async function assertOAuthCallbackSession(
  request: Request,
  expectedUserId: string,
  platform: string,
): Promise<void> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user?.id === expectedUserId) {
    await clearOAuthConnectBinding(request);
    return;
  }

  if (await verifyOAuthConnectBinding(request, expectedUserId, platform)) {
    await clearOAuthConnectBinding(request);
    return;
  }

  safeRedirect(
    `/dashboard/connections?error=oauth_session_mismatch&platform=${encodeURIComponent(platform)}`,
    "/dashboard/connections",
  );
}

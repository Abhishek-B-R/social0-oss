import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { safeRedirect } from "@/lib/redirect";

/**
 * OAuth callbacks must match the user who started the connect flow.
 * Prevents CSRF account linking (victim authorizes → attacker's Social0 account).
 */
export async function assertOAuthCallbackSession(
  expectedUserId: string,
  platform: string,
): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || session.user.id !== expectedUserId) {
    safeRedirect(
      `/dashboard/connections?error=oauth_session_mismatch&platform=${encodeURIComponent(platform)}`,
      "/dashboard/connections",
    );
  }
}

import { auth } from "./auth.js";
import { safeRedirect } from "./redirect.js";
import { headers } from "./shim/next-headers.js";
import {
  clearOAuthConnectBinding,
  verifyOAuthConnectBinding,
} from "./oauth-connect-binding.js";

async function readCallbackSession(request: Request) {
  const fromRequest = await auth.api.getSession({ headers: request.headers });
  if (fromRequest?.user?.id) return fromRequest;

  const headerList = await headers();
  return auth.api.getSession({ headers: headerList });
}

/**
 * OAuth callbacks must match the user who started the connect flow.
 * Prevents CSRF account linking (victim authorizes → attacker's Social0 user).
 */
export async function assertOAuthCallbackSession(
  request: Request,
  expectedUserId: string,
  platform: string,
): Promise<void> {
  const session = await readCallbackSession(request);
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

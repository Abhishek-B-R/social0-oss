import { assignSafeRedirectUrl } from "@/lib/safe-external-url";

/** Handle account-picker POST: API returns JSON redirectUrl (split deploy). */
export async function completeConnectSelect(
  res: Response,
  fallbackReturnTo: string,
): Promise<void> {
  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { message?: string }).message ??
        "You need an active plan to connect accounts and post content.",
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

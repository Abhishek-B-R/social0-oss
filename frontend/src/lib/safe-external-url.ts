import { sanitizeReturnToPath } from "./safe-return-to";

export { sanitizeReturnToPath };

const DODO_CHECKOUT_HOSTS = [
  "checkout.dodopayments.com",
  "test.checkout.dodopayments.com",
  "customer.dodopayments.com",
  "test.customer.dodopayments.com",
];

/** Allow https redirects to trusted billing hosts or same-origin paths. */
export function assertSafeExternalRedirectUrl(
  url: string,
  appOrigin?: string,
): boolean {
  try {
    const resolved = appOrigin
      ? new URL(url, appOrigin)
      : new URL(url);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      return false;
    }
    if (appOrigin) {
      try {
        if (resolved.origin === new URL(appOrigin).origin) return true;
      } catch {
        // ignore invalid appOrigin
      }
    }
    if (resolved.protocol !== "https:") return false;
    const host = resolved.hostname.toLowerCase();
    return DODO_CHECKOUT_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

/** Presigned upload URLs must target Cloudflare R2 (or configured public R2 domain). */
export function isAllowedPresignedUploadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host.endsWith(".r2.cloudflarestorage.com") ||
      host.endsWith(".r2.dev") ||
      host.endsWith(".cloudflarestorage.com")
    );
  } catch {
    return false;
  }
}

/** Navigate only to safe in-app paths or trusted billing URLs. */
export function assignSafeRedirectUrl(url: string): boolean {
  if (typeof window === "undefined") return false;
  const origin = window.location.origin;
  const inApp = sanitizeReturnToPath(url);
  if (inApp) {
    window.location.assign(inApp);
    return true;
  }
  try {
    const resolved = new URL(url, origin);
    if (resolved.origin === origin) {
      window.location.assign(resolved.href);
      return true;
    }
  } catch {
    return false;
  }
  if (assertSafeExternalRedirectUrl(url, origin)) {
    window.location.assign(url);
    return true;
  }
  return false;
}

/** Safe https link for user-visible platform post URLs. */
export function isSafeHttpsLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

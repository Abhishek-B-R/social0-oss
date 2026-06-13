/** Cloudflare dummy keys for automated browser testing — https://developers.cloudflare.com/turnstile/troubleshooting/testing/ */
export const TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_ALWAYS_PASS =
  "1x0000000000000000000000000000000AA";

export function isTurnstileTestSiteKey(siteKey: string): boolean {
  return /^[123]x0{16}[A-F0-9]{2}$/i.test(siteKey);
}

export function isTurnstileTestSecret(secret: string): boolean {
  return /^[123]x0{31}[A-F0-9]{2}$/i.test(secret);
}

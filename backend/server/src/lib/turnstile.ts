/** Cloudflare dummy keys for automated browser testing - https://developers.cloudflare.com/turnstile/troubleshooting/testing/ */
export const TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_ALWAYS_PASS =
  "1x0000000000000000000000000000000AA";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileVerifyResult =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 422;
      error: string;
      code: "turnstile_failed";
      retry: true;
    };

export function isTurnstileTestSiteKey(siteKey: string): boolean {
  return /^[123]x0{16}[A-F0-9]{2}$/i.test(siteKey);
}

export function isTurnstileTestSecret(secret: string): boolean {
  return /^[123]x0{31}[A-F0-9]{2}$/i.test(secret);
}

/** ponytail: optional bot check — skipped when TURNSTILE_SECRET_KEY is unset */
export async function verifyTurnstileIfConfigured(
  turnstileToken: string | undefined,
  secretKey: string | undefined,
): Promise<TurnstileVerifyResult> {
  const secret = secretKey?.trim();
  if (!secret) return { ok: true };
  if (!turnstileToken) {
    return {
      ok: false,
      status: 400,
      error: "Missing turnstile token",
      code: "turnstile_failed",
      retry: true,
    };
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", turnstileToken);

  const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body: formData,
  });
  const verifyData = (await verifyRes.json()) as {
    success?: boolean;
    "error-codes"?: string[];
  };

  if (!verifyData.success) {
    return {
      ok: false,
      status: 422,
      error: "Please complete the verification challenge and try again.",
      code: "turnstile_failed",
      retry: true,
    };
  }

  return { ok: true };
}

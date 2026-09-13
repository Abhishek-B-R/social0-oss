import { env } from "./env.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;

export type TurnstileResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Turnstile is only enforced when the operator has configured the secret. */
export function isTurnstileConfigured(): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY?.trim());
}

/**
 * Verify a Turnstile token against Cloudflare's siteverify API.
 *
 * Fails closed: a missing token, a rejected token, or an unreachable
 * Cloudflare all deny the request. A challenge that cannot be checked is not a
 * challenge, and the only caller is sign-up, where retrying is cheap.
 */
export async function verifyTurnstileToken(
  token: unknown,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "Bot protection is not configured on this server.",
    };
  }

  if (typeof token !== "string" || !token.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Captcha verification is required.",
    };
  }

  const form = new URLSearchParams({ secret, response: token.trim() });
  // Cloudflare rejects obviously bogus values here, so only send a real one.
  if (remoteIp && remoteIp !== "anonymous") form.set("remoteip", remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        status: 503,
        error: "Could not verify the captcha. Please try again.",
      };
    }
    const data = (await res.json()) as { success?: boolean };
    if (data?.success === true) return { ok: true };
    return {
      ok: false,
      status: 400,
      error: "Captcha verification failed. Please try again.",
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Could not verify the captcha. Please try again.",
    };
  } finally {
    clearTimeout(timer);
  }
}

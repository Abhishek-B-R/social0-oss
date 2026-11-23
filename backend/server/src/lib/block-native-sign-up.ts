/** Block Better Auth native email sign-up in production (use /api/auth/sign-up wrapper). */
export function isBlockedNativeSignUpPath(pathname: string): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const path = pathname.toLowerCase();
  if (path.includes("sign-up-with-turnstile")) return false;
  return (
    path.endsWith("/sign-up/email") ||
    path.endsWith("/sign-up") ||
    /\/sign-up\/[^/]+$/.test(path)
  );
}

/**
 * Sign-in by email OTP is not a Social0 flow: the SPA signs in with a password
 * or Google and uses OTP only to verify an email or reset a password. Left
 * reachable, it is a second sign-up path that skips the /api/auth/sign-up
 * wrapper and mails codes to any address. Blocked in every environment.
 */
export function isBlockedOtpSignInRequest(
  method: string,
  pathname: string,
  body: unknown,
): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  if (path.endsWith("/sign-in/email-otp")) return true;
  if (!path.endsWith("/email-otp/send-verification-otp")) return false;
  if (!body || typeof body !== "object") return false;
  const type = (body as { type?: unknown }).type;
  return typeof type === "string" && type.trim().toLowerCase() === "sign-in";
}

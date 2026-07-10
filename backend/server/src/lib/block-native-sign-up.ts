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

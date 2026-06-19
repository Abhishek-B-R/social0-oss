import { env } from "@/lib/env";

export type SignUpConfig = {
  turnstileSiteKey: string;
  signUpEndpoint: "/api/auth/sign-up-with-turnstile" | "/api/auth/sign-up";
  requiresTurnstileToken: boolean;
  /** Production is missing Turnstile keys — email sign-up cannot work. */
  misconfigured: boolean;
};

export function buildSignUpConfig(input: {
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
  isProduction: boolean;
}): SignUpConfig {
  const turnstileSiteKey = input.turnstileSiteKey ?? "";
  const hasSecret = Boolean(input.turnstileSecretKey);
  const requiresTurnstile = input.isProduction || Boolean(turnstileSiteKey);
  const misconfigured =
    input.isProduction && (!turnstileSiteKey || !hasSecret);

  return {
    turnstileSiteKey,
    signUpEndpoint: requiresTurnstile
      ? "/api/auth/sign-up-with-turnstile"
      : "/api/auth/sign-up",
    requiresTurnstileToken: requiresTurnstile,
    misconfigured,
  };
}

export function getSignUpConfig(): SignUpConfig {
  return buildSignUpConfig({
    turnstileSiteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
    isProduction: process.env.NODE_ENV === "production",
  });
}

/** Client-safe helper (no server secrets). */
export function getClientSignUpConfig(): SignUpConfig {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const isProduction = process.env.NODE_ENV === "production";
  const requiresTurnstile = isProduction || Boolean(turnstileSiteKey);

  return {
    turnstileSiteKey,
    signUpEndpoint: requiresTurnstile
      ? "/api/auth/sign-up-with-turnstile"
      : "/api/auth/sign-up",
    requiresTurnstileToken: requiresTurnstile,
    misconfigured: isProduction && !turnstileSiteKey,
  };
}

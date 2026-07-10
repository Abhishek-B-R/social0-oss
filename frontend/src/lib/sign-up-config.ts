export type SignUpConfig = {
  turnstileSiteKey: string;
  requiresTurnstileToken: boolean;
};

export function buildSignUpConfig(input: {
  turnstileSiteKey?: string;
}): SignUpConfig {
  const turnstileSiteKey = input.turnstileSiteKey?.trim() ?? "";

  return {
    turnstileSiteKey,
    requiresTurnstileToken: Boolean(turnstileSiteKey),
  };
}

/** Safe for client components - does not import server env validation. */
export function getClientSignUpConfig(): SignUpConfig {
  return buildSignUpConfig({
    turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
  });
}

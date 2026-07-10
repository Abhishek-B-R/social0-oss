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

/** Stable onboarding routes — keep checkout/OAuth returnTo in sync. */
export const ONBOARDING_PATHS = {
  welcome: "/onboarding",
  connect: "/onboarding/step2",
  plan: "/onboarding/step3",
  ready: "/onboarding/step4",
} as const;

export const ONBOARDING_CONNECT_RETURN = ONBOARDING_PATHS.connect;
export const ONBOARDING_CHECKOUT_SUCCESS = `${ONBOARDING_PATHS.plan}?paid=1`;
export const ONBOARDING_PAYMENT_FAILED = `${ONBOARDING_PATHS.plan}?payment_failed=1`;

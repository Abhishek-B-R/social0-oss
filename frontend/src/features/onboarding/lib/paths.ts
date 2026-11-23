/**
 * Onboarding routes. The URLs are stable (router.tsx, OAuth `returnTo` and
 * billing `successUrl` all point at them), so the step names moved but the
 * paths did not:
 *
 *   /onboarding        1 · Goal
 *   /onboarding/step2  2 · Connect accounts
 *   /onboarding/step3  3 · How will you post? (was: plan picker)
 *   /onboarding/step4  legacy "Ready" page: finishes setup and lands on Home
 *
 * Plans are no longer a step: any step can open the plans dialog with
 * `?plans=1`, and checkout returns to the step it started from with `?paid=1`.
 */
export const ONBOARDING_PATHS = {
  welcome: "/onboarding",
  connect: "/onboarding/step2",
  postMode: "/onboarding/step3",
  /** Old final step. Kept so bookmarks and in-flight links still finish setup. */
  legacyReady: "/onboarding/step4",
} as const;

/** Where onboarding ends. */
export const ONBOARDING_FINISH_PATH = "/dashboard/home";

/** OAuth connect flows return here. */
export const ONBOARDING_CONNECT_RETURN = ONBOARDING_PATHS.connect;

/** Query params the onboarding pages read. */
export const PLANS_PARAM = "plans";
export const PAID_PARAM = "paid";
export const PAYMENT_FAILED_PARAM = "payment_failed";

/** Billing `successUrl` for a checkout started on `pathname`. */
export function checkoutReturnPath(pathname: string): string {
  const base = pathname.replace(/\/+$/, "") || ONBOARDING_PATHS.welcome;
  return `${base}?${PAID_PARAM}=1`;
}

export type OnboardingStep = { num: 1 | 2 | 3; label: string; path: string };

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { num: 1, label: "Goal", path: ONBOARDING_PATHS.welcome },
  { num: 2, label: "Connect", path: ONBOARDING_PATHS.connect },
  { num: 3, label: "How you'll post", path: ONBOARDING_PATHS.postMode },
] as const;

/** Step number (1–3) for an onboarding pathname. */
export function onboardingStepFromPath(pathname: string): 1 | 2 | 3 {
  if (pathname.startsWith(ONBOARDING_PATHS.connect)) return 2;
  if (
    pathname.startsWith(ONBOARDING_PATHS.postMode) ||
    pathname.startsWith(ONBOARDING_PATHS.legacyReady)
  ) {
    return 3;
  }
  return 1;
}

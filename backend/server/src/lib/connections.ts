import type { AccountLimitResult } from "./plan-limits.js";

const NO_PLAN_MESSAGE =
  "You need an active plan to connect accounts and post content.";

/**
 * Text for a `limit_reached` 403 from an account picker (`checkAccountLimits`
 * result). Only a plan with no account slots at all is told to get a plan; a
 * paid plan at its cap is told the cap, and a pick that would overshoot the
 * slots left says how many fit.
 */
export function accountLimitMessage(
  limit: Pick<AccountLimitResult, "currentTotal" | "limitTotal">,
  requested = 1,
): string {
  if (limit.limitTotal <= 0) return NO_PLAN_MESSAGE;
  const left = Math.max(0, limit.limitTotal - limit.currentTotal);
  if (left === 0 || requested <= 1) {
    return `Plan limit: up to ${limit.limitTotal} connected accounts. Upgrade to add more.`;
  }
  return `You have ${left} account slot${left === 1 ? "" : "s"} left on your plan. Pick ${left} or fewer, or upgrade.`;
}

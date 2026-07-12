/**
 * Client-side Dodo product IDs (VITE_* env). Plan limits live in @social0/shared/browser.
 */
import { getDodoProductId } from "./env";

export {
  getPlanLimits,
  getTierFromProductId,
  isActiveTier,
  type PlanLimits,
  type SubscriptionTier,
} from "@social0/shared/browser";

export const PLAN_IDS = {
  starter: getDodoProductId("starter"),
  growth: getDodoProductId("growth"),
  pro: getDodoProductId("pro"),
} as const;

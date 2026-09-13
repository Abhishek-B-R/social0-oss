import {
  onPaidPlanActivated,
  type SubscriptionState,
} from "@social0/shared/lib/subscription";

/**
 * Workspace provisioning lives here, not in shared: the background worker has
 * no Teams surface. Registering on import is enough because every caller
 * reaches `setSubscription` through this module.
 */
onPaidPlanActivated(async (userId) => {
  const { ensureOwnerWorkspace } = await import("./workspace/context.js");
  await ensureOwnerWorkspace(userId);
});

export { getSubscriptionForUser, setSubscription } from "@social0/shared/lib/subscription";
export type { SubscriptionState };

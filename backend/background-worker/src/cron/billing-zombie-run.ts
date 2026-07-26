import { sweepStaleZombieSubscriptions } from "../lib/billing-zombie-cleanup.js";

export async function runBillingZombieCleanup(force = false) {
  return sweepStaleZombieSubscriptions({ force });
}

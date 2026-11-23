import { PLAN_NAMES, type SubscriptionTier } from "@/lib/plans";

/** Plan display names. The spellings live in `PLAN_NAMES` (`@/lib/plans`). */
export const PLAN_NAME: Record<SubscriptionTier, string> = PLAN_NAMES;

/** "creator" → "Creator"; unknown → "Free". */
export function planName(tier: string | null | undefined): string {
  return PLAN_NAMES[(tier ?? "free") as SubscriptionTier] ?? PLAN_NAMES.free;
}

/** "creator" → "Creator plan". */
export function planLabel(tier: string | null | undefined): string {
  return `${planName(tier)} plan`;
}

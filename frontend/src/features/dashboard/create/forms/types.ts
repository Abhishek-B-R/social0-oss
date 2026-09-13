import type { SubscriptionTier } from "@/lib/plans";

/**
 * A connected account as the post forms consume it.
 *
 * Each form declared its own copy; the image and video ones additionally
 * carried `platformMetadata`, which is why this is the widest of the five. The
 * extra optional field is invisible to the forms that never read it.
 */
export type PostFormAccount = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  isTwitterPremium?: boolean;
  tokenExpired?: boolean;
  platformMetadata?: Record<string, unknown>;
};

/** Per-platform caption override state, keyed by platform id in the forms. */
export type PlatformCaptionState = {
  overridden: boolean;
  value: string;
};

/**
 * The props every post form takes from its page. `accounts` is generic so a
 * form can narrow to its own account shape while the rest stays one contract.
 */
export type PostFormProps<TAccount = PostFormAccount> = {
  accounts: TAccount[];
  accountsLoading?: boolean;
  use24HourTimeFormat?: boolean;
  dateFormat?: string | null;
  timezone?: string | null;
  draftId?: string;
  scheduledId?: string;
  editId?: string;
  allowAutoRepost?: boolean;
  allowAutoPlug?: boolean;
  supportedPlatforms?: string[];
  subscriptionTier?: SubscriptionTier;
  freePostsUsed?: number;
  isGuest?: boolean;
};

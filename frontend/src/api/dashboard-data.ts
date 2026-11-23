import { rpc } from "@/lib/rpc";
import type { PublicationRow } from "@/features/dashboard/posts/posts-list-types";
import type {
  PostSourceDto,
  PostsStatusCounts,
  PostsStatusFilter,
  PublicationErrorKind,
} from "@/api/dashboard";

type SerializedPublication = Omit<PublicationRow, "publishedAt"> & {
  publishedAt: string | null;
  /** Failed publications only: which fix to offer. */
  errorKind?: PublicationErrorKind | null;
  /** Connected account token_status (active | expired | unknown). */
  tokenStatus?: string | null;
  /** Additive: failed, and the account was reconnected after it failed. */
  reconnectedSinceFailure?: boolean;
};

export type LoadPostsPageDataResult =
  | {
      ok: true;
      data: {
        userPosts: Array<{
          id: string;
          originalContent: string | null;
          status: string | null;
          scheduledAt: string | null;
          failureReason: string | null;
          createdAt: string | null;
          /** Additive: last write to the post (a publish / retry bumps it). */
          updatedAt?: string | null;
          mediaIds: string[] | null;
          metadata: unknown;
          /** Who created it (You / teammate / API key / CLI / MCP host). */
          source?: PostSourceDto;
          /** Classified post-level failureReason (failed / partial posts). */
          failureKind?: PublicationErrorKind | null;
        }>;
        publicationsByPostId: Record<string, SerializedPublication[]>;
        firstMediaByPost: Record<
          string,
          {
            mimeType: string;
            originalFilename: string | null;
            url: string | null;
            thumbnailUrl: string | null;
          }
        >;
        resurfaceByPostId: Record<
          string,
          {
            id: string;
            isActive: boolean;
            resurfacesDone: number;
            maxResurfaces: number;
            intervalHours: number;
            plugComment: string | null;
          }
        >;
        totalCount: number;
        queuedPostIds: string[];
        /** Queue slot id per queued post on this page (older API builds omit it). */
        queuedSlotByPostId?: Record<string, string>;
        platformOptions: { value: string; label: string }[];
        accountOptions: { value: string; label: string }[];
        /**
         * Every source that created a post in this workspace. `value` is the
         * `source` filter token; label it with `getPostSourceFromDto(source)`.
         * Optional: older API builds don't send it.
         */
        sourceOptions?: { value: string; source: PostSourceDto; count: number }[];
        showPaymentFailedBanner: boolean;
        use24HourTimeFormat: boolean;
        dateFormat: string | null;
        timezone: string | null;
        /** Per-tab counts (omitted when includeCounts is false). */
        statusCounts?: PostsStatusCounts;
      };
    }
  | { ok: false; error: string };

export type LoadConnectionsPageDataResult =
  | {
      ok: true;
      data: {
        accounts: Array<{
          id: string;
          platform: string;
          platformUsername: string | null;
          platformDisplayName?: string | null;
          profileImageUrl: string | null;
          isActive: boolean | null;
          isTwitterPremium: boolean;
          tokenStatus: "ok" | "expired";
          expiresInDays: number | null;
          /** Instagram: "direct" | "facebook-page" */
          connectionMethod?: string | null;
          /** When the account was connected. */
          createdAt?: string | null;
          /** Latest publish through Social0 on this account (null = never). */
          lastPostAt?: string | null;
        }>;
        accountLimit: AccountLimitResult | undefined;
        hasUsedTrial: boolean;
        canManageConnections?: boolean;
        canAccessBilling?: boolean;
      };
    }
  | { ok: false; error: string };

export type AccountLimitResult = {
  currentTotal: number;
  limitTotal: number;
  hasUsedTrial: boolean;
  /** Agency: accounts included before extras are billed (59). */
  includedTotal?: number;
  /** Agency: accounts above `includedTotal` are added to the bill, never blocked. */
  autoBilled?: boolean;
};

export type SubscriptionState = {
  tier: string;
  expiresAt: Date | null;
  cancelAtPeriodEnd: boolean;
  paused: boolean;
  interval?: "monthly" | "yearly" | null;
  pendingPlanTier?: string | null;
  /** Agency only: paid accounts above the 59 included (0 otherwise). */
  extraAccounts?: number;
};

export type SerializedSubscriptionState = Omit<SubscriptionState, "expiresAt"> & {
  expiresAt: string | null;
};

export type LoadBillingPageDataResult =
  | {
      ok: true;
      data: {
        subscription: SerializedSubscriptionState;
        accountLimit: AccountLimitResult;
        dateFormat: string | null;
        timezone: string | null;
      };
    }
  | { ok: false; error: string };

export type LoadCalendarPageDataResult =
  | {
      ok: true;
      data: {
        posts: Array<{
          id: string;
          snippet: string;
          status: string;
          displayDate: string;
          platform: string | null;
          profileImageUrl: string | null;
          platformUsername: string | null;
          isTwitterPremium?: boolean | null;
          /** Raw scheduled time (null when never scheduled). */
          scheduledAt?: string | null;
          /** One entry per target account. */
          publications?: Array<{
            publicationId: string;
            connectedAccountId: string | null;
            platform: string;
            status: string | null;
            platformUsername: string | null;
            platformPostUrl: string | null;
            errorKind: PublicationErrorKind | null;
          }>;
          source?: PostSourceDto;
          /** Queue slot a scheduled post holds (pending link), else null. */
          queueSlotId?: string | null;
        }>;
        initialMonth: string;
        use24HourTimeFormat: boolean;
        dateFormat: string | null;
        timezone: string | null;
        /**
         * Zone queue slots are defined in (the workspace owner's saved
         * timezone, UTC when unset). Optional: older API builds omit it.
         */
        queueTimezone?: string;
      };
    }
  | { ok: false; error: string };

export type LoadPostDetailCoreDataResult =
  | {
      ok: true;
      data: {
        post: {
          id: string;
          originalContent: string | null;
          status: string | null;
          scheduledAt: string | null;
          createdAt: string | null;
          /** Additive: last write to the post (a publish / retry bumps it). */
          updatedAt?: string | null;
          mediaIds: string[] | null;
          metadata: Record<string, unknown> | null;
          failureReason: string | null;
          createdByUserId?: string | null;
          source?: PostSourceDto;
          failureKind?: PublicationErrorKind | null;
        };
        publications: SerializedPublication[];
        queuedSlot: { slotId: string; scheduledFor: string } | null;
        autoPlug: {
          id: string;
          status: string;
          metricType: string;
          metricThreshold: number;
          plugComment: string;
        } | null;
        resurface: {
          id: string;
          isActive: boolean;
          resurfacesDone: number;
          maxResurfaces: number;
          intervalHours: number;
          plugComment: string | null;
        } | null;
        publishTimeline: Array<{
          id: string;
          phase: string;
          platform: string | null;
          message: string | null;
          createdAt: string;
        }>;
        showPaymentFailedBanner: boolean;
        use24HourTimeFormat: boolean;
        dateFormat: string | null;
        timezone: string | null;
        allowAutoPlug: boolean;
        allowResurface: boolean;
      };
    }
  | { ok: false; error: string };

export type LoadPostDetailMediaDataResult =
  | {
      ok: true;
      data: {
        media: Array<{
          id: string;
          originalFilename: string;
          mimeType: string;
          url: string | null;
          thumbnailUrl: string | null;
        }>;
      };
    }
  | { ok: false; error: string };

export async function loadPostsPageData(input: {
  statusFilter?: PostsStatusFilter;
  sort?: string | null;
  platform?: string | null;
  time?: string | null;
  account?: string | null;
  /** Caption search (case-insensitive substring). */
  query?: string | null;
  /** Source filter token (`sourceOptions[].value`). */
  source?: string | null;
  page?: number | null;
  /** Default true: include statusCounts for the tabs. */
  includeCounts?: boolean | null;
}): Promise<LoadPostsPageDataResult> {
  return rpc("dashboard-data.loadPostsPageData", input);
}

export async function loadConnectionsPageData(opts?: {
  /** Skip the live token refresh/verify (fast; used by the sidebar). */
  skipHealthCheck?: boolean;
}): Promise<LoadConnectionsPageDataResult> {
  return opts
    ? rpc("dashboard-data.loadConnectionsPageData", opts)
    : rpc("dashboard-data.loadConnectionsPageData");
}

export async function loadBillingPageData(): Promise<LoadBillingPageDataResult> {
  return rpc("dashboard-data.loadBillingPageData");
}

export async function loadCalendarPageData(): Promise<LoadCalendarPageDataResult> {
  return rpc("dashboard-data.loadCalendarPageData");
}

export async function loadPostDetailCoreData(
  postId: string,
): Promise<LoadPostDetailCoreDataResult> {
  return rpc("dashboard-data.loadPostDetailCoreData", postId);
}

export async function loadPostDetailMediaData(
  postId: string,
): Promise<LoadPostDetailMediaDataResult> {
  return rpc("dashboard-data.loadPostDetailMediaData", postId);
}

export type LoadAdjacentPostsResult =
  | {
      ok: true;
      data: { prevId: string | null; nextId: string | null };
    }
  | { ok: false; error: string };

export async function loadAdjacentPosts(input: {
  postId: string;
  statusFilter?: PostsStatusFilter;
  sort?: string | null;
  platform?: string | null;
  time?: string | null;
  account?: string | null;
  query?: string | null;
  source?: string | null;
}): Promise<LoadAdjacentPostsResult> {
  return rpc("dashboard-data.loadAdjacentPosts", input);
}

export type DashboardLayoutData = {
  planLabel: string;
  subscriptionTier: string;
  freePostsBanner: { remaining: number; limit: number } | null;
  profileName: string | null;
  profileImage: string | null;
  canCreatePosts: boolean;
  canViewAnalytics: boolean;
  canViewInbox: boolean;
  canReplyComments: boolean;
  canReplyDms: boolean;
};

export function loadDashboardLayoutData(): Promise<DashboardLayoutData> {
  return rpc("dashboard-data.loadDashboardLayoutData");
}

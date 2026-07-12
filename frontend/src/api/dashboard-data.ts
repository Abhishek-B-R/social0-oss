import { rpc } from "@/lib/rpc";
import type { PublicationRow } from "@social0/shared";

type SerializedPublication = Omit<PublicationRow, "publishedAt"> & {
  publishedAt: string | null;
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
          mediaIds: string[] | null;
          metadata: unknown;
        }>;
        publicationsByPostId: Record<string, SerializedPublication[]>;
        firstMediaByPost: Record<
          string,
          { mimeType: string; originalFilename: string | null }
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
        platformOptions: { value: string; label: string }[];
        accountOptions: { value: string; label: string }[];
        showPaymentFailedBanner: boolean;
        use24HourTimeFormat: boolean;
        dateFormat: string | null;
        timezone: string | null;
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
          tokenStatus: "ok" | "expiring_soon" | "expired";
          expiresInDays: number | null;
        }>;
        accountLimit:
          | {
              currentTotal: number;
              limitTotal: number;
              hasUsedTrial: boolean;
            }
          | undefined;
        hasUsedTrial: boolean;
      };
    }
  | { ok: false; error: string };

export type AccountLimitResult = {
  currentTotal: number;
  limitTotal: number;
  hasUsedTrial: boolean;
};

export type SubscriptionState = {
  tier: string;
  expiresAt: Date | null;
  cancelAtPeriodEnd: boolean;
  paused: boolean;
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
        }>;
        initialMonth: string;
        use24HourTimeFormat: boolean;
        dateFormat: string | null;
        timezone: string | null;
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
          mediaIds: string[] | null;
          metadata: Record<string, unknown> | null;
          failureReason: string | null;
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
  statusFilter?: "scheduled" | "posted" | "draft" | null;
  sort?: string | null;
  platform?: string | null;
  time?: string | null;
  account?: string | null;
  page?: number | null;
}): Promise<LoadPostsPageDataResult> {
  return rpc("dashboard-data.loadPostsPageData", input);
}

export async function loadConnectionsPageData(): Promise<LoadConnectionsPageDataResult> {
  return rpc("dashboard-data.loadConnectionsPageData");
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

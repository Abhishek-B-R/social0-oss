"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getPostsListData,
  hasPaymentFailedPosts,
  POSTS_PAGE_SIZE,
  getPostDetail,
  getPostMedia,
} from "@/app/dashboard/posts/posts-list-data";
import type { PublicationRow, StatusFilter } from "@/app/dashboard/posts/posts-list-types";
import { getSubscriptionForUser } from "@/lib/subscription";
import { getPlanLimits } from "@/lib/plans";
import { getUserSettingsSnapshot } from "@/bff/actions/settings";
import type { SubscriptionState } from "@/lib/subscription";
import {
  checkAccountLimits,
  checkFreePostLimit,
  checkBulkToolsAllowed,
} from "@/lib/plan-limits";
import type {
  AccountLimitResult,
} from "@/lib/plan-limits";
import { db } from "@/db";
import { posts, postPublications, connectedAccounts, userSettings } from "@/db/schema";
import { eq, inArray, and, or } from "drizzle-orm";
import { format, subMonths, addMonths } from "date-fns";
import { syncConnectedAccountsToLimit } from "@/lib/plan-limits";
import { NEVER_EXPIRES_PLATFORMS } from "@/lib/token-health";
import { isActiveTier } from "@/lib/plans";
import { user } from "@/db/schema";
import type { SubscriptionTier } from "@/lib/plans";

/** Dashboard layout bootstrap (subscription, profile, free-tier banner). */
export async function loadDashboardLayoutData(): Promise<{
  planLabel: string;
  subscriptionTier: string;
  freePostsBanner: { remaining: number; limit: number } | null;
  profileName: string | null;
  profileImage: string | null;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const userId = session.user.id;

  const subscription = await getSubscriptionForUser(userId);
  const tier = subscription.tier;
  const [profileRow, freeLimit] = await Promise.all([
    db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { name: true, image: true },
    }),
    !isActiveTier(tier) ? checkFreePostLimit(userId) : Promise.resolve(null),
  ]);

  const planLabel =
    tier === "pro"
      ? "Pro plan"
      : tier === "growth"
        ? "Growth plan"
        : tier === "starter"
          ? "Starter (Lite) plan"
          : "Free plan";

  return {
    planLabel,
    subscriptionTier: tier,
    freePostsBanner:
      freeLimit && !isActiveTier(tier)
        ? { remaining: freeLimit.remaining, limit: freeLimit.limit }
        : null,
    profileName: profileRow?.name ?? null,
    profileImage: profileRow?.image ?? null,
  };
}

export async function checkBulkToolsGate(): Promise<{ allowed: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { allowed: false };
  const allowed = await checkBulkToolsAllowed(session.user.id);
  return { allowed };
}

export async function loadComposerSettings(): Promise<{
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
  freePostsUsed: number;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("Unauthorized");
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: {
      subscriptionTier: true,
      subscriptionExpiresAt: true,
      freePostsUsed: true,
    },
  });
  return {
    subscriptionTier: (row?.subscriptionTier as SubscriptionTier) ?? "free",
    subscriptionExpiresAt: row?.subscriptionExpiresAt
      ? row.subscriptionExpiresAt.toISOString()
      : null,
    freePostsUsed: row?.freePostsUsed ?? 0,
  };
}

/** Mirrors `PostForCalendar` in CalendarClient (kept here to avoid server importing client module). */
type CalendarPostPayload = {
  id: string;
  snippet: string;
  status: string;
  displayDate: string;
  platform: string | null;
  profileImageUrl: string | null;
  platformUsername: string | null;
  isTwitterPremium?: boolean | null;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SKIP_EXPIRY_DISPLAY = new Set(["youtube", "tiktok"]);

function getTokenStatus(
  dbTokenStatus: string | null,
  expiresAt: Date | null,
  platform: string,
): "ok" | "expiring_soon" | "expired" {
  if (dbTokenStatus === "expired") return "expired";
  if (NEVER_EXPIRES_PLATFORMS.has(platform)) return "ok";
  if (SKIP_EXPIRY_DISPLAY.has(platform)) return "ok";
  if (!expiresAt) return "ok";
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) return "expired";
  if (exp < now + 7 * ONE_DAY_MS) return "expiring_soon";
  return "ok";
}

function getExpiresInDays(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) return null;
  return Math.ceil((exp - now) / ONE_DAY_MS);
}

type SerializedPublication = Omit<PublicationRow, "publishedAt"> & {
  publishedAt: string | null;
};

function serializePublications(
  byPost: Record<string, PublicationRow[]>,
): Record<string, SerializedPublication[]> {
  const out: Record<string, SerializedPublication[]> = {};
  for (const [k, pubs] of Object.entries(byPost)) {
    out[k] = pubs.map((p) => ({
      ...p,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    }));
  }
  return out;
}

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

export async function loadPostsPageData(input: {
  statusFilter?: "scheduled" | "posted" | "draft" | null;
  sort?: string | null;
  platform?: string | null;
  time?: string | null;
  account?: string | null;
  page?: number | null;
}): Promise<LoadPostsPageDataResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = session.user.id;
  const page = Math.max(1, input.page ?? 1);
  const statusFilter: StatusFilter =
    input.statusFilter === "posted"
      ? "published"
      : (input.statusFilter ?? null);

  const [
    listResult,
    settings,
    showPaymentFailedBanner,
  ] = await Promise.all([
    getPostsListData({
      userId,
      statusFilter,
      sort: input.sort === "oldest" ? "oldest" : "newest",
      platform: input.platform || null,
      time: input.time || null,
      account: input.account || null,
      page,
      limit: POSTS_PAGE_SIZE,
    }),
    getUserSettingsSnapshot(),
    hasPaymentFailedPosts(userId),
  ]);

  const {
    userPosts,
    publicationsByPostId,
    firstMediaByPost,
    resurfaceByPostId,
    totalCount,
    queuedPostIds,
    platformOptions,
    accountOptions,
  } = listResult;

  return {
    ok: true,
    data: {
      userPosts: userPosts.map((p) => ({
        id: p.id,
        originalContent: p.originalContent,
        status: p.status,
        scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
        failureReason: p.failureReason,
        createdAt: p.createdAt ? p.createdAt.toISOString() : null,
        mediaIds: p.mediaIds,
        metadata: p.metadata,
      })),
      publicationsByPostId: serializePublications(publicationsByPostId),
      firstMediaByPost: Object.fromEntries(firstMediaByPost),
      resurfaceByPostId,
      totalCount,
      queuedPostIds: Array.from(queuedPostIds ?? []),
      platformOptions,
      accountOptions,
      showPaymentFailedBanner,
      use24HourTimeFormat: settings.use24HourTimeFormat,
      dateFormat: settings.dateFormat,
      timezone: settings.timezone,
    },
  };
}

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

export async function loadConnectionsPageData(): Promise<LoadConnectionsPageDataResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = session.user.id;

  await syncConnectedAccountsToLimit(userId).catch(() => {});

  const [accounts, accountLimit] = await Promise.all([
    db.query.connectedAccounts.findMany({
      where: eq(connectedAccounts.userId, userId),
      columns: {
        id: true,
        platform: true,
        platformUsername: true,
        platformMetadata: true,
        profileImageUrl: true,
        isActive: true,
        tokenExpiresAt: true,
        tokenStatus: true,
        isTwitterPremium: true,
      },
    }),
    checkAccountLimits(userId, "linkedin"),
  ]);

  const mapped = accounts.map((a) => {
    const status = getTokenStatus(
      a.tokenStatus ?? null,
      a.tokenExpiresAt ?? null,
      a.platform,
    );
    const expiresInDays = getExpiresInDays(a.tokenExpiresAt ?? null);
    return {
      id: a.id,
      platform: a.platform,
      platformUsername: a.platformUsername,
      platformDisplayName: null,
      profileImageUrl: a.profileImageUrl,
      isActive: a.isActive,
      isTwitterPremium: a.isTwitterPremium ?? false,
      tokenStatus: status,
      expiresInDays: status === "expiring_soon" ? expiresInDays : null,
    };
  });

  return {
    ok: true,
    data: {
      accounts: mapped,
      accountLimit: {
        currentTotal: accountLimit.currentTotal,
        limitTotal: accountLimit.limitTotal,
        hasUsedTrial: accountLimit.hasUsedTrial,
      },
      hasUsedTrial: accountLimit.hasUsedTrial,
    },
  };
}

export type SerializedSubscriptionState = Omit<
  SubscriptionState,
  "expiresAt"
> & {
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

export async function loadBillingPageData(): Promise<LoadBillingPageDataResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = session.user.id;

  const [{ dateFormat, timezone }, subscription, accountLimit] =
    await Promise.all([
      getUserSettingsSnapshot(),
      getSubscriptionForUser(userId),
      checkAccountLimits(userId, "linkedin"),
    ]);

  const serialized: SerializedSubscriptionState = {
    ...subscription,
    expiresAt: subscription.expiresAt
      ? subscription.expiresAt.toISOString()
      : null,
  };

  return {
    ok: true,
    data: {
      subscription: serialized,
      accountLimit,
      dateFormat,
      timezone,
    },
  };
}

export type LoadCalendarPageDataResult =
  | {
      ok: true;
      data: {
        posts: CalendarPostPayload[];
        initialMonth: string;
        use24HourTimeFormat: boolean;
        dateFormat: string | null;
        timezone: string | null;
      };
    }
  | { ok: false; error: string };

export async function loadCalendarPageData(): Promise<LoadCalendarPageDataResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = session.user.id;

  const now = new Date();
  const rangeStart = subMonths(now, 1);
  const rangeEnd = addMonths(now, 2);

  const [{ use24HourTimeFormat, dateFormat, timezone }, userPosts] =
    await Promise.all([
      getUserSettingsSnapshot(),
      db
        .select({
      id: posts.id,
      originalContent: posts.originalContent,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      createdAt: posts.createdAt,
    })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            or(
              eq(posts.status, "scheduled"),
              eq(posts.status, "published"),
              eq(posts.status, "partial"),
              eq(posts.status, "failed"),
            ),
          ),
        ),
    ]);

  const postIds = userPosts.map((p) => p.id);

  if (postIds.length === 0) {
    return {
      ok: true,
      data: {
        posts: [],
        initialMonth: format(now, "yyyy-MM"),
        use24HourTimeFormat,
        dateFormat,
        timezone,
      },
    };
  }

  const publications = await db
    .select({
      postId: postPublications.postId,
      publishedAt: postPublications.publishedAt,
      platform: connectedAccounts.platform,
      profileImageUrl: connectedAccounts.profileImageUrl,
      platformUsername: connectedAccounts.platformUsername,
      isTwitterPremium: connectedAccounts.isTwitterPremium,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(inArray(postPublications.postId, postIds));

  const firstPublicationByPost = new Map<
    string,
    {
      publishedAt: Date | null;
      platform: string;
      profileImageUrl: string | null;
      platformUsername: string | null;
      isTwitterPremium: boolean | null;
    }
  >();
  for (const pub of publications) {
    const existing = firstPublicationByPost.get(pub.postId);
    const pubAt = pub.publishedAt ? new Date(pub.publishedAt) : null;
    if (
      !existing ||
      (pubAt && (!existing.publishedAt || pubAt < existing.publishedAt))
    ) {
      firstPublicationByPost.set(pub.postId, {
        publishedAt: pubAt,
        platform: pub.platform,
        profileImageUrl: pub.profileImageUrl,
        platformUsername: pub.platformUsername,
        isTwitterPremium: pub.isTwitterPremium,
      });
    }
  }

  const calendarPosts: CalendarPostPayload[] = [];
  for (const post of userPosts) {
    const displayDate =
      post.status === "scheduled" && post.scheduledAt
        ? new Date(post.scheduledAt)
        : (firstPublicationByPost.get(post.id)?.publishedAt ??
          post.createdAt ??
          new Date());
    if (displayDate < rangeStart || displayDate > rangeEnd) continue;
    const firstPub = firstPublicationByPost.get(post.id);
    calendarPosts.push({
      id: post.id,
      snippet: post.originalContent?.slice(0, 40).trim() || "(No caption)",
      status: post.status ?? "scheduled",
      displayDate: displayDate.toISOString(),
      platform: firstPub?.platform ?? null,
      profileImageUrl: firstPub?.profileImageUrl ?? null,
      platformUsername: firstPub?.platformUsername ?? null,
      isTwitterPremium: firstPub?.isTwitterPremium ?? null,
    });
  }

  return {
    ok: true,
    data: {
      posts: calendarPosts,
      initialMonth: format(now, "yyyy-MM"),
      use24HourTimeFormat,
      dateFormat,
      timezone,
    },
  };
}

type SerializedPostDetail = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  mediaIds: string[] | null;
  metadata: Record<string, unknown> | null;
  failureReason: string | null;
};

type SerializedQueuedSlot = {
  slotId: string;
  scheduledFor: string;
} | null;

type SerializedAutoPlug = {
  id: string;
  status: string;
  metricType: string;
  metricThreshold: number;
  plugComment: string;
} | null;

type SerializedResurface = {
  id: string;
  isActive: boolean;
  resurfacesDone: number;
  maxResurfaces: number;
  intervalHours: number;
  plugComment: string | null;
} | null;

export type LoadPostDetailCoreDataResult =
  | {
      ok: true;
      data: {
        post: SerializedPostDetail;
        publications: SerializedPublication[];
        queuedSlot: SerializedQueuedSlot;
        autoPlug: SerializedAutoPlug;
        resurface: SerializedResurface;
        showPaymentFailedBanner: boolean;
        use24HourTimeFormat: boolean;
        dateFormat: string | null;
        timezone: string | null;
        allowAutoPlug: boolean;
        allowResurface: boolean;
      };
    }
  | { ok: false; error: string };

export async function loadPostDetailCoreData(
  postId: string,
): Promise<LoadPostDetailCoreDataResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };
  const userId = session.user.id;

  const [detail, settings, showPaymentFailedBanner, subscription] =
    await Promise.all([
      getPostDetail(postId, userId),
      getUserSettingsSnapshot(),
      hasPaymentFailedPosts(userId),
      getSubscriptionForUser(userId),
    ]);

  if (!detail) return { ok: false, error: "NotFound" };
  const planLimits = getPlanLimits(subscription.tier);

  return {
    ok: true,
    data: {
      post: {
        ...detail.post,
        scheduledAt: detail.post.scheduledAt
          ? detail.post.scheduledAt.toISOString()
          : null,
        createdAt: detail.post.createdAt
          ? detail.post.createdAt.toISOString()
          : null,
      },
      publications: detail.publications.map((p) => ({
        ...p,
        publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      })),
      queuedSlot: detail.queuedSlot
        ? {
            slotId: detail.queuedSlot.slotId,
            scheduledFor: detail.queuedSlot.scheduledFor.toISOString(),
          }
        : null,
      autoPlug: detail.autoPlug,
      resurface: detail.resurface,
      showPaymentFailedBanner,
      use24HourTimeFormat: settings.use24HourTimeFormat,
      dateFormat: settings.dateFormat,
      timezone: settings.timezone,
      allowAutoPlug: planLimits.allowAutoPlug,
      allowResurface: planLimits.allowResurface,
    },
  };
}

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

export async function loadPostDetailMediaData(
  postId: string,
): Promise<LoadPostDetailMediaDataResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };
  const userId = session.user.id;

  const detail = await getPostDetail(postId, userId);
  if (!detail) return { ok: false, error: "NotFound" };
  const mediaIds = detail.post.mediaIds ?? [];
  const media = mediaIds.length > 0 ? await getPostMedia(userId, mediaIds) : [];
  return { ok: true, data: { media } };
}

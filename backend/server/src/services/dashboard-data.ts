
import { auth } from "@/lib/auth";
import { headers } from "../lib/http/request-cookies.js";
import { resolveWorkspaceContext, connectionScopeCondition } from "@/lib/workspace/context";
import {
  getPostsListData,
  hasPaymentFailedPosts,
  POSTS_PAGE_SIZE,
  getPostDetail,
  getPostMedia,
  getAdjacentPostIds,
} from "@/lib/posts-list/posts-list-data";
import type { PublicationRow, StatusFilter } from "@social0/shared";
import { getSubscriptionForUser } from "@/lib/subscription";
import {
  getIntervalFromProductId,
  getPlanLimits,
  type BillingInterval,
} from "@social0/shared";
import { getUserSettingsSnapshot } from "@/services/settings";
import type { SubscriptionState } from "@/lib/subscription";
import { env } from "@/lib/env";
import DodoPayments from "dodopayments";
import {
  checkAccountLimits,
  checkFreePostLimit,
  checkBulkToolsAllowed,
} from "@/lib/plan-limits";
import type {
  AccountLimitResult,
} from "@/lib/plan-limits";
import { db } from "@/db";
import {
  posts,
  postPublications,
  connectedAccounts,
  userSettings,
  user,
} from "@/db/schema";
import { eq, inArray, and, or, isNull } from "drizzle-orm";
import { format } from "date-fns";
import { syncConnectedAccountsToLimit } from "@/lib/plan-limits";
import { NEVER_EXPIRES_PLATFORMS } from "@/lib/token-health";
import { isActiveTier } from "@social0/shared";
import type { SubscriptionTier } from "@social0/shared";
import {
  loadPublishTimelineForPost,
  type PublishTimelineEvent,
} from "@/lib/publish-timeline";

export type { PublishTimelineEvent };

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
  const actorUserId = session.user.id;
  // Sidebar plan is always the signed-in user's personal subscription.
  // Workspace owner's tier (resourceUserId) gates team features, but must not
  // label the actor as Pro when they're only a member of a Pro team.
  const ctx = await resolveWorkspaceContext(actorUserId);
  const subscription = await getSubscriptionForUser(actorUserId);
  const tier = subscription.tier;
  const [profileRow, freeLimit] = await Promise.all([
    db.query.user.findFirst({
      where: eq(user.id, actorUserId),
      columns: { name: true, image: true },
    }),
    // Free-post quota is personal; only surface it outside team workspaces.
    !ctx.inWorkspace && !isActiveTier(tier)
      ? checkFreePostLimit(actorUserId)
      : Promise.resolve(null),
  ]);

  const planLabel =
    tier === "max"
      ? "Max plan"
      : tier === "pro"
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
  const ctx = await resolveWorkspaceContext(session.user.id);
  const allowed = await checkBulkToolsAllowed(ctx.resourceUserId);
  return { allowed };
}

export async function loadComposerSettings(): Promise<{
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
  freePostsUsed: number;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("Unauthorized");
  const ctx = await resolveWorkspaceContext(session.user.id);
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, ctx.resourceUserId),
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

/**
 * Connection badge status.
 * Never surface calendar "expires in X days" — refreshable platforms renew silently.
 * Only show expired after health/refresh has actually failed (db token_status).
 */
function getTokenStatus(
  dbTokenStatus: string | null,
  _expiresAt: Date | null,
  platform: string,
): "ok" | "expired" {
  if (NEVER_EXPIRES_PLATFORMS.has(platform)) return "ok";
  if (dbTokenStatus === "expired") return "expired";
  return "ok";
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
  const ctx = await resolveWorkspaceContext(session.user.id);
  const userId = ctx.resourceUserId;
  const workspaceId = ctx.workspaceId;
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
      workspaceId,
      statusFilter,
      sort: input.sort === "oldest" ? "oldest" : "newest",
      platform: input.platform || null,
      time: input.time || null,
      account: input.account || null,
      page,
      limit: POSTS_PAGE_SIZE,
    }),
    getUserSettingsSnapshot(),
    hasPaymentFailedPosts(userId, workspaceId),
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
          tokenStatus: "ok" | "expired";
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
        /** Additive: false for members without manage_connections. */
        canManageConnections?: boolean;
        /** Owner (or personal account) can open billing upgrade CTAs. */
        canAccessBilling?: boolean;
      };
    }
  | { ok: false; error: string };

export async function loadConnectionsPageData(): Promise<LoadConnectionsPageDataResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized" };
  }
  const ctx = await resolveWorkspaceContext(session.user.id);
  const userId = ctx.resourceUserId;

  await syncConnectedAccountsToLimit(userId).catch(() => {});

  // Silent refresh + verify stale connections before rendering badges.
  const { runTokenHealthCheckForUser } = await import("@/lib/token-health");
  await runTokenHealthCheckForUser(userId).catch((err) => {
    console.warn("[connections] token health check failed:", err);
  });

  const [accounts, accountLimit] = await Promise.all([
    db.query.connectedAccounts.findMany({
      where: connectionScopeCondition(ctx),
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
    const meta = (a.platformMetadata ?? null) as Record<string, unknown> | null;
    const connectionMethod =
      typeof meta?.connectionMethod === "string" ? meta.connectionMethod : null;
    return {
      id: a.id,
      platform: a.platform,
      platformUsername: a.platformUsername,
      platformDisplayName: null,
      profileImageUrl: a.profileImageUrl,
      isActive: a.isActive,
      isTwitterPremium: a.isTwitterPremium ?? false,
      tokenStatus: status,
      expiresInDays: null,
      connectionMethod,
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
      canManageConnections: ctx.permissions.has("manage_connections"),
      canAccessBilling: ctx.permissions.has("access_billing"),
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
  // Billing is always personal (actor’s own subscription). Team Members must
  // still manage their own plan — never the workspace owner’s.
  const userId = session.user.id;

  const [{ dateFormat, timezone }, subscription, accountLimit] =
    await Promise.all([
      getUserSettingsSnapshot(),
      getSubscriptionForUser(userId),
      checkAccountLimits(userId, "linkedin"),
    ]);

  let interval: BillingInterval | null = null;
  if (subscription.subscriptionId && env.DODO_PAYMENTS_API_KEY) {
    try {
      const client = new DodoPayments({
        bearerToken: env.DODO_PAYMENTS_API_KEY,
        environment: env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode",
      });
      const sub = await client.subscriptions.retrieve(
        subscription.subscriptionId,
      );
      interval = getIntervalFromProductId(sub.product_id ?? "") ?? null;
    } catch {
      // Best-effort — UI falls back to monthly display prices.
    }
  }

  const serialized: SerializedSubscriptionState = {
    ...subscription,
    interval,
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
  const ctx = await resolveWorkspaceContext(session.user.id);
  const userId = ctx.resourceUserId;
  const workspaceId = ctx.workspaceId;

  const now = new Date();

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
            workspaceId
              ? eq(posts.workspaceId, workspaceId)
              : isNull(posts.workspaceId),
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
        publishTimeline: PublishTimelineEvent[];
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
  const ctx = await resolveWorkspaceContext(session.user.id);
  const userId = ctx.resourceUserId;
  const workspaceId = ctx.workspaceId;

  const [detail, settings, showPaymentFailedBanner, subscription, publishTimeline] =
    await Promise.all([
      getPostDetail(postId, userId, workspaceId),
      getUserSettingsSnapshot(),
      hasPaymentFailedPosts(userId, workspaceId),
      getSubscriptionForUser(userId),
      loadPublishTimelineForPost(postId, userId),
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
      publishTimeline,
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
  const ctx = await resolveWorkspaceContext(session.user.id);
  const userId = ctx.resourceUserId;
  const workspaceId = ctx.workspaceId;

  const detail = await getPostDetail(postId, userId, workspaceId);
  if (!detail) return { ok: false, error: "NotFound" };
  const mediaIds = detail.post.mediaIds ?? [];
  const media = mediaIds.length > 0 ? await getPostMedia(userId, mediaIds) : [];
  return { ok: true, data: { media } };
}

export type LoadAdjacentPostsResult =
  | {
      ok: true;
      data: { prevId: string | null; nextId: string | null };
    }
  | { ok: false; error: string };

/** List-context neighbors for post detail edge / keyboard navigation. */
export async function loadAdjacentPosts(input: {
  postId: string;
  statusFilter?: "scheduled" | "posted" | "draft" | null;
  sort?: string | null;
  platform?: string | null;
  time?: string | null;
  account?: string | null;
}): Promise<LoadAdjacentPostsResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };
  const ctx = await resolveWorkspaceContext(session.user.id);
  const userId = ctx.resourceUserId;
  const workspaceId = ctx.workspaceId;

  const postId = input?.postId;
  if (!postId || typeof postId !== "string") {
    return { ok: false, error: "BadRequest" };
  }

  const detail = await getPostDetail(postId, userId, workspaceId);
  if (!detail) return { ok: false, error: "NotFound" };

  const statusFilter: StatusFilter =
    input.statusFilter === "posted"
      ? "published"
      : input.statusFilter === "scheduled" || input.statusFilter === "draft"
        ? input.statusFilter
        : null;

  const adjacent = await getAdjacentPostIds(postId, userId, {
    workspaceId,
    statusFilter,
    sort: input.sort === "oldest" ? "oldest" : "newest",
    platform: input.platform || null,
    time: input.time || null,
    account: input.account || null,
  });
  return { ok: true, data: adjacent };
}

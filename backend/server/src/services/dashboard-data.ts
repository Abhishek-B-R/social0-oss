
import { auth } from "@/lib/auth";
import { headers } from "../lib/http/request-cookies.js";
import { resolveWorkspaceContext, connectionScopeCondition } from "@/lib/workspace/context";
import { requireWorkspaceSession } from "@/lib/workspace/session";
import { rpcHttpError } from "@/lib/rpc-http-error";
import {
  getPostsListData,
  getPostsStatusCounts,
  hasPaymentFailedPosts,
  POSTS_PAGE_SIZE,
  getPostDetail,
  getPostMedia,
  getAdjacentPostIds,
  getPostsSourceOptions,
  type DashboardPublicationRow,
  type PostsStatusCounts,
} from "@/lib/posts-list/posts-list-data";
import {
  classifyPublicationError,
  type PublicationErrorKind,
} from "@/lib/publication-error-kind";
import {
  buildPostSourceDtos,
  loadUserNames,
  type PostSourceDto,
} from "@/lib/post-source";
import type { StatusFilter } from "@social0/shared";
import { getSubscriptionForUser } from "@/lib/subscription";
import {
  getIntervalFromProductId,
  getPlanLimits,
  type BillingInterval,
} from "@social0/shared";
import { getUserSettingsSnapshot } from "@/services/settings";
import { getUserTimezone } from "@/lib/resolve-scheduled-at";
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
  queuedPosts,
} from "@/db/schema";
import {
  eq,
  inArray,
  and,
  or,
  isNull,
  isNotNull,
  max,
  asc,
  gte,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";
import { format } from "date-fns";
import { syncConnectedAccountsToLimit } from "@/lib/plan-limits";
import { NEVER_EXPIRES_PLATFORMS } from "@/lib/token-health";
import { isActiveTier, planDisplayName } from "@social0/shared";
import type { SubscriptionTier } from "@social0/shared";
import {
  loadPublishTimelineForPost,
  type PublishTimelineEvent,
} from "@/lib/publish-timeline";

export type { PublishTimelineEvent, PostSourceDto, PublicationErrorKind, PostsStatusCounts };

/** Status filter values the Posts page sends (legacy + redesign tabs). */
export type PostsStatusFilterInput =
  | "scheduled"
  | "posted"
  | "published"
  | "draft"
  | "needs_review"
  | "user_draft"
  | "failed"
  | null;

/**
 * Map the RPC filter to the list filter. "posted" is the legacy tab
 * (published only); "published" is the redesign tab, which also includes
 * partly published posts.
 */
function toStatusFilter(input: unknown): StatusFilter {
  switch (input) {
    case "posted":
      return "published";
    case "published":
      return "published_or_partial";
    case "draft":
    case "scheduled":
    case "failed":
    case "needs_review":
    case "user_draft":
      return input;
    default:
      return null;
  }
}

/** Dashboard layout bootstrap (subscription, profile, free-tier banner). */
export async function loadDashboardLayoutData(): Promise<{
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

  const planLabel = `${planDisplayName(isActiveTier(tier) ? tier : "free")} plan`;

  return {
    planLabel,
    subscriptionTier: tier,
    freePostsBanner:
      freeLimit && !isActiveTier(tier)
        ? { remaining: freeLimit.remaining, limit: freeLimit.limit }
        : null,
    profileName: profileRow?.name ?? null,
    profileImage: profileRow?.image ?? null,
    canCreatePosts: ctx.permissions.has("create_posts"),
    canViewAnalytics: ctx.permissions.has("view_analytics"),
    canViewInbox: ctx.permissions.has("view_inbox"),
    canReplyComments: ctx.permissions.has("reply_comments"),
    canReplyDms: ctx.permissions.has("reply_dms"),
  };
}

export async function checkBulkToolsGate(): Promise<{ allowed: boolean }> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return { allowed: false };
  const ctx = ws.ctx;
  const allowed = await checkBulkToolsAllowed(ctx.resourceUserId);
  return { allowed };
}

export async function loadComposerSettings(): Promise<{
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
  freePostsUsed: number;
}> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) throw rpcHttpError(ws.error, ws.statusCode);
  const ctx = ws.ctx;
  // The tier is the one the server enforces (`getSubscriptionForUser`), not
  // the raw column: a paid plan stands past `subscriptionExpiresAt` (Dodo's
  // next_billing_date) until the renewal webhook lands. Reading the raw
  // column, the composer showed paying users the free quota and disabled
  // Auto-Plug / Auto-Repost from their billing date onward.
  const [subscription, row] = await Promise.all([
    getSubscriptionForUser(ctx.resourceUserId),
    db.query.userSettings.findFirst({
      where: eq(userSettings.userId, ctx.resourceUserId),
      columns: { freePostsUsed: true },
    }),
  ]);
  return {
    subscriptionTier: subscription.tier,
    subscriptionExpiresAt: subscription.expiresAt
      ? new Date(subscription.expiresAt).toISOString()
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
  /** Additive (redesign): raw scheduled time, null when never scheduled. */
  scheduledAt?: string | null;
  /** Additive (redesign): one entry per target account. */
  publications?: Array<{
    publicationId: string;
    connectedAccountId: string | null;
    platform: string;
    status: string | null;
    platformUsername: string | null;
    platformPostUrl: string | null;
    errorKind: PublicationErrorKind | null;
  }>;
  /** Additive (redesign): who created it. */
  source?: PostSourceDto;
  /** Additive (redesign): queue slot a scheduled post holds (pending), else null. */
  queueSlotId?: string | null;
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

type SerializedPublication = Omit<DashboardPublicationRow, "publishedAt"> & {
  publishedAt: string | null;
  /** Set on failed publications: which fix to offer (see publication-error-kind). */
  errorKind: PublicationErrorKind | null;
};

function serializePublication(p: DashboardPublicationRow): SerializedPublication {
  return {
    ...p,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    errorKind: classifyPublicationError({
      error: p.lastError,
      status: p.status ?? "pending",
      tokenStatus: p.tokenStatus,
      platform: p.platform,
    }),
  };
}

function serializePublications(
  byPost: Record<string, DashboardPublicationRow[]>,
): Record<string, SerializedPublication[]> {
  const out: Record<string, SerializedPublication[]> = {};
  for (const [k, pubs] of Object.entries(byPost)) {
    out[k] = pubs.map(serializePublication);
  }
  return out;
}

/** Post-level failure (e.g. "Payment required") classified the same way. */
function postFailureKind(post: {
  status: string | null;
  failureReason: string | null;
}): PublicationErrorKind | null {
  if (!post.failureReason?.trim()) return null;
  if (post.status !== "failed" && post.status !== "partial") return null;
  return classifyPublicationError({ error: post.failureReason });
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
          /** Last write to the post (a publish / retry bumps it). */
          updatedAt: string | null;
          mediaIds: string[] | null;
          metadata: unknown;
          /** Who created it (dashboard user, API key, CLI, MCP host). */
          source: PostSourceDto;
          /** Classified `failureReason` for failed / partial posts. */
          failureKind: PublicationErrorKind | null;
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
        /** Additive: queue slot id per queued post on this page. */
        queuedSlotByPostId: Record<string, string>;
        platformOptions: { value: string; label: string }[];
        accountOptions: { value: string; label: string }[];
        /**
         * Every source that created a post in this scope. `value` is the
         * `source` filter token; the SPA labels `source` as a chip.
         */
        sourceOptions: { value: string; source: PostSourceDto; count: number }[];
        showPaymentFailedBanner: boolean;
        use24HourTimeFormat: boolean;
        dateFormat: string | null;
        timezone: string | null;
        /**
         * Per-tab counts with the same network/account/time/search filters
         * applied. Omitted when the caller passes `includeCounts: false`.
         */
        statusCounts?: PostsStatusCounts;
      };
    }
  | { ok: false; error: string };

/**
 * The zone the Posts "This week" / "This month" filter counts in: the viewer's
 * own saved timezone (the one `loadPostsPageData` returns for display), not
 * the post owner's or the server's. Only read when that filter is on.
 */
async function postsFilterTimeZone(
  time: string | null,
  viewerUserId: string,
): Promise<string | null> {
  if (time !== "week" && time !== "month") return null;
  return getUserTimezone(viewerUserId);
}

export async function loadPostsPageData(input: {
  statusFilter?: PostsStatusFilterInput;
  sort?: string | null;
  platform?: string | null;
  time?: string | null;
  account?: string | null;
  /** Caption search (case-insensitive substring). */
  query?: string | null;
  /** Source filter token from `sourceOptions[].value`. */
  source?: string | null;
  page?: number | null;
  /** Default true. */
  includeCounts?: boolean | null;
}): Promise<LoadPostsPageDataResult> {
  // Same gate as posts.* / dashboard.getHome: a teammate whose owner's Pro
  // lapsed reads nothing from the team.
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return { ok: false, error: ws.error };
  const ctx = ws.ctx;
  const userId = ctx.resourceUserId;
  const workspaceId = ctx.workspaceId;
  const page = Math.max(1, Number(input?.page) || 1);
  const statusFilter = toStatusFilter(input?.statusFilter);
  const query = typeof input?.query === "string" ? input.query : null;
  const time = input?.time || null;
  const filters = {
    userId,
    workspaceId,
    platform: input?.platform || null,
    time,
    account: input?.account || null,
    query,
    source: typeof input?.source === "string" ? input.source : null,
    timeZone: await postsFilterTimeZone(time, ctx.actorUserId),
  };

  const [
    listResult,
    settings,
    showPaymentFailedBanner,
    statusCounts,
    sourceOptionRows,
  ] = await Promise.all([
    getPostsListData({
      ...filters,
      statusFilter,
      sort: input?.sort === "oldest" ? "oldest" : "newest",
      page,
      limit: POSTS_PAGE_SIZE,
    }),
    getUserSettingsSnapshot(),
    hasPaymentFailedPosts(userId, workspaceId),
    input?.includeCounts === false
      ? Promise.resolve(undefined)
      : getPostsStatusCounts(filters),
    getPostsSourceOptions({ userId, workspaceId }),
  ]);

  const {
    userPosts,
    publicationsByPostId,
    firstMediaByPost,
    resurfaceByPostId,
    totalCount,
    queuedPostIds,
    queuedSlotByPostId,
    platformOptions,
    accountOptions,
  } = listResult;

  const [sources, sourceUserNames] = await Promise.all([
    buildPostSourceDtos(userPosts, {
      actorUserId: ctx.actorUserId,
      ownerUserId: userId,
    }),
    loadUserNames(sourceOptionRows.map((r) => r.userId)),
  ]);
  const sourceOptions = sourceOptionRows.map((r) => ({
    value: r.value,
    count: r.count,
    source: {
      kind: r.kind,
      userId: r.userId,
      userName: r.userId ? (sourceUserNames.get(r.userId) ?? null) : null,
      isCurrentUser: r.kind === "user" && r.userId === ctx.actorUserId,
      keyId: null,
      keyName: r.keyName,
      client: r.client,
    } satisfies PostSourceDto,
  }));

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
        updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
        mediaIds: p.mediaIds,
        metadata: p.metadata,
        source: sources.get(p.id)!,
        failureKind: postFailureKind(p),
      })),
      publicationsByPostId: serializePublications(publicationsByPostId),
      firstMediaByPost: Object.fromEntries(firstMediaByPost),
      resurfaceByPostId,
      totalCount,
      queuedPostIds: Array.from(queuedPostIds ?? []),
      queuedSlotByPostId,
      platformOptions,
      accountOptions,
      sourceOptions,
      showPaymentFailedBanner,
      use24HourTimeFormat: settings.use24HourTimeFormat,
      dateFormat: settings.dateFormat,
      timezone: settings.timezone,
      ...(statusCounts ? { statusCounts } : {}),
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
          /** Additive (redesign): when the account was connected. */
          createdAt?: string | null;
          /** Additive (redesign): latest publish through Social0 on this account. */
          lastPostAt?: string | null;
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

export async function loadConnectionsPageData(
  opts?: { skipHealthCheck?: boolean } | null,
): Promise<LoadConnectionsPageDataResult> {
  // Same gate as posts.* / dashboard.getHome: a teammate whose owner's Pro
  // lapsed reads nothing from the team.
  const ws = await requireWorkspaceSession("view_connections");
  if (!ws.ok) return { ok: false, error: ws.error };
  const ctx = ws.ctx;
  const userId = ctx.resourceUserId;

  await syncConnectedAccountsToLimit(userId).catch(() => {});

  // Silent refresh + verify stale connections before rendering badges.
  // The sidebar skips this (it calls live platform APIs and can take 10s+);
  // the Accounts page runs it.
  if (!opts?.skipHealthCheck) {
    const { runTokenHealthCheckForUser } = await import("@/lib/token-health");
    await runTokenHealthCheckForUser(userId).catch((err) => {
      console.warn("[connections] token health check failed:", err);
    });
  }

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
        createdAt: true,
      },
    }),
    checkAccountLimits(userId, "linkedin"),
  ]);

  // "Last post" column: one grouped read over this workspace's accounts.
  const accountIds = accounts.map((a) => a.id);
  const lastPostRows =
    accountIds.length > 0
      ? await db
          .select({
            accountId: postPublications.connectedAccountId,
            lastPostAt: max(postPublications.publishedAt),
          })
          .from(postPublications)
          .where(
            and(
              inArray(postPublications.connectedAccountId, accountIds),
              isNotNull(postPublications.publishedAt),
            ),
          )
          .groupBy(postPublications.connectedAccountId)
      : [];
  const lastPostByAccount = new Map<string, Date>();
  for (const row of lastPostRows) {
    if (row.accountId && row.lastPostAt) {
      lastPostByAccount.set(row.accountId, new Date(row.lastPostAt));
    }
  }

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
      createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
      lastPostAt: lastPostByAccount.get(a.id)?.toISOString() ?? null,
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
        // Only decides monthly vs yearly copy; never hold the page for it.
        timeout: 3_000,
        maxRetries: 0,
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
        /**
         * Zone the queue slots' hour/minute are read in: the workspace
         * owner's saved timezone (UTC when unset or invalid), the same one
         * `/api/queue/next-slot` uses. Differs from `timezone` (the viewer's
         * own) when a teammate opens a team calendar.
         */
        queueTimezone: string;
        /**
         * Additive: true when more posts matched than `CALENDAR_MAX_POSTS`
         * and the farthest ones (from today, or from the start of the
         * requested window) were left out.
         */
        truncated?: boolean;
      };
    }
  | { ok: false; error: string };

/**
 * Most posts one calendar read returns. Bounds the payload and the
 * publications `IN (...)` list (Postgres caps a statement at 65,535 binds).
 */
export const CALENDAR_MAX_POSTS = 1000;
/** Widest window a caller may ask for. A month grid is at most six weeks. */
export const CALENDAR_MAX_RANGE_DAYS = 400;
/** Slack added on each side of a requested window (viewer vs browser zone). */
const CALENDAR_RANGE_PAD_MS = 24 * 60 * 60 * 1000;

/**
 * Optional visible window. `from` / `to` are instants (ISO strings or
 * revived Dates); `to` is exclusive. Omit both for the default read: the
 * `CALENDAR_MAX_POSTS` posts nearest to today.
 */
export type LoadCalendarPageDataInput = {
  from?: string | Date | null;
  to?: string | Date | null;
} | null;

type CalendarWindow = { from: Date; to: Date };

function parseInstant(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const d =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

/**
 * `undefined` = no window requested, `null` = malformed request, else the
 * padded window to read.
 */
export function resolveCalendarWindow(
  input: unknown,
): CalendarWindow | null | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as { from?: unknown; to?: unknown };
  const from = parseInstant(raw.from);
  const to = parseInstant(raw.to);
  if (from === undefined && to === undefined) return undefined;
  if (!from || !to || to.getTime() <= from.getTime()) return null;
  if (to.getTime() - from.getTime() > CALENDAR_MAX_RANGE_DAYS * 86_400_000) {
    return null;
  }
  return {
    from: new Date(from.getTime() - CALENDAR_RANGE_PAD_MS),
    to: new Date(to.getTime() + CALENDAR_RANGE_PAD_MS),
  };
}

/** Day the calendar places a post on, before its publications are known. */
const calendarPostAnchorSql = sql`coalesce(${posts.scheduledAt}, ${posts.createdAt})`;

/**
 * Posts the calendar could place inside `w`: planned / created in it, or
 * delivered in it (a failed or late post lands on its publish time).
 */
function calendarWindowCondition(w: CalendarWindow): SQL {
  return or(
    and(
      isNotNull(posts.scheduledAt),
      gte(posts.scheduledAt, w.from),
      lt(posts.scheduledAt, w.to),
    ),
    and(
      isNull(posts.scheduledAt),
      gte(posts.createdAt, w.from),
      lt(posts.createdAt, w.to),
    ),
    sql`exists (select 1 from ${postPublications} where ${and(
      eq(postPublications.postId, posts.id),
      gte(postPublications.publishedAt, w.from),
      lt(postPublications.publishedAt, w.to),
    )})`,
  )!;
}

export async function loadCalendarPageData(
  input?: LoadCalendarPageDataInput,
): Promise<LoadCalendarPageDataResult> {
  // Same gate as posts.* / dashboard.getHome: a teammate whose owner's Pro
  // lapsed reads nothing from the team.
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return { ok: false, error: ws.error };
  const ctx = ws.ctx;
  const userId = ctx.resourceUserId;
  const workspaceId = ctx.workspaceId;

  const range = resolveCalendarWindow(input);
  if (range === null) return { ok: false, error: "BadRequest" };

  const now = new Date();
  // Timestamps are stored as UTC wall time without a zone, the same way
  // drizzle writes a Date into a `timestamp` column.
  const nowSql = sql`${now.toISOString()}::timestamp`;

  const [{ use24HourTimeFormat, dateFormat, timezone }, queueTimezone, matchedPosts] =
    await Promise.all([
      getUserSettingsSnapshot(),
      getUserTimezone(userId),
      db
        .select({
          id: posts.id,
          originalContent: posts.originalContent,
          status: posts.status,
          scheduledAt: posts.scheduledAt,
          createdAt: posts.createdAt,
          // Only `source` is read (post-source.ts); skip caption/thread payloads.
          metadata: sql<Record<string, unknown> | null>`jsonb_build_object('source', ${posts.metadata} -> 'source')`,
          createdByUserId: posts.createdByUserId,
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
              eq(posts.status, "publishing"),
              eq(posts.status, "published"),
              eq(posts.status, "partial"),
              eq(posts.status, "failed"),
              // Drafts with a planned time show dashed on the calendar.
              and(eq(posts.status, "draft"), isNotNull(posts.scheduledAt)),
            ),
            range ? calendarWindowCondition(range) : undefined,
          ),
        )
        .orderBy(
          range
            ? asc(calendarPostAnchorSql)
            : // No window: keep the posts nearest today, where the calendar opens.
              sql`abs(extract(epoch from (${calendarPostAnchorSql} - ${nowSql})))`,
          asc(posts.id),
        )
        // One extra row tells us the cap cut something off.
        .limit(CALENDAR_MAX_POSTS + 1),
    ]);

  const truncated = matchedPosts.length > CALENDAR_MAX_POSTS;
  const userPosts = truncated
    ? matchedPosts.slice(0, CALENDAR_MAX_POSTS)
    : matchedPosts;
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
        queueTimezone,
        truncated,
      },
    };
  }

  const scheduledIds = userPosts.filter((p) => p.status === "scheduled").map((p) => p.id);
  const [publications, sources, queueLinks] = await Promise.all([
    db
      .select({
        postId: postPublications.postId,
        publicationId: postPublications.id,
        connectedAccountId: postPublications.connectedAccountId,
        status: postPublications.status,
        lastError: postPublications.lastError,
        platformPostUrl: postPublications.platformPostUrl,
        publishedAt: postPublications.publishedAt,
        platform: connectedAccounts.platform,
        profileImageUrl: connectedAccounts.profileImageUrl,
        platformUsername: connectedAccounts.platformUsername,
        isTwitterPremium: connectedAccounts.isTwitterPremium,
        tokenStatus: connectedAccounts.tokenStatus,
      })
      .from(postPublications)
      .innerJoin(
        connectedAccounts,
        eq(postPublications.connectedAccountId, connectedAccounts.id),
      )
      .where(inArray(postPublications.postId, postIds)),
    buildPostSourceDtos(userPosts, {
      actorUserId: ctx.actorUserId,
      ownerUserId: userId,
    }),
    scheduledIds.length > 0
      ? db
          .select({ postId: queuedPosts.postId, slotId: queuedPosts.slotId })
          .from(queuedPosts)
          .where(
            and(
              inArray(queuedPosts.postId, scheduledIds),
              eq(queuedPosts.status, "pending"),
            ),
          )
      : Promise.resolve([] as { postId: string; slotId: string | null }[]),
  ]);
  const queueSlotByPost = new Map<string, string>();
  for (const link of queueLinks) {
    if (link.slotId) queueSlotByPost.set(link.postId, link.slotId);
  }

  const publicationsByPost = new Map<
    string,
    NonNullable<CalendarPostPayload["publications"]>
  >();
  for (const pub of publications) {
    const list = publicationsByPost.get(pub.postId) ?? [];
    list.push({
      publicationId: pub.publicationId,
      connectedAccountId: pub.connectedAccountId,
      platform: pub.platform,
      status: pub.status,
      platformUsername: pub.platformUsername,
      platformPostUrl: pub.platformPostUrl,
      errorKind: classifyPublicationError({
        error: pub.lastError,
        status: pub.status ?? "pending",
        tokenStatus: pub.tokenStatus,
        platform: pub.platform,
      }),
    });
    publicationsByPost.set(pub.postId, list);
  }

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
      (post.status === "scheduled" || post.status === "draft" || post.status === "publishing") &&
      post.scheduledAt
        ? new Date(post.scheduledAt)
        : // A failed delivery never gets publishedAt: fall back to the time the
          // post was due, not the day it was written.
          (firstPublicationByPost.get(post.id)?.publishedAt ??
          post.scheduledAt ??
          post.createdAt ??
          new Date());
    const firstPub = firstPublicationByPost.get(post.id);
    calendarPosts.push({
      id: post.id,
      // Cut by code point so an emoji at the boundary isn't split in half.
      snippet:
        Array.from(post.originalContent ?? "").slice(0, 40).join("").trim() ||
        "(No caption)",
      status: post.status ?? "scheduled",
      displayDate: displayDate.toISOString(),
      platform: firstPub?.platform ?? null,
      profileImageUrl: firstPub?.profileImageUrl ?? null,
      platformUsername: firstPub?.platformUsername ?? null,
      isTwitterPremium: firstPub?.isTwitterPremium ?? null,
      scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
      publications: publicationsByPost.get(post.id) ?? [],
      source: sources.get(post.id),
      queueSlotId: queueSlotByPost.get(post.id) ?? null,
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
      queueTimezone,
      truncated,
    },
  };
}

type SerializedPostDetail = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  /** Last write to the post (a publish / retry bumps it). */
  updatedAt: string | null;
  mediaIds: string[] | null;
  metadata: Record<string, unknown> | null;
  failureReason: string | null;
  createdByUserId: string | null;
  source: PostSourceDto;
  failureKind: PublicationErrorKind | null;
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
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return { ok: false, error: ws.error };
  const ctx = ws.ctx;
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
  const sources = await buildPostSourceDtos([detail.post], {
    actorUserId: ctx.actorUserId,
    ownerUserId: userId,
  });

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
        updatedAt: detail.post.updatedAt
          ? detail.post.updatedAt.toISOString()
          : null,
        source: sources.get(detail.post.id)!,
        failureKind: postFailureKind(detail.post),
      },
      publications: detail.publications.map(serializePublication),
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
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return { ok: false, error: ws.error };
  const ctx = ws.ctx;
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
  statusFilter?: PostsStatusFilterInput;
  sort?: string | null;
  platform?: string | null;
  time?: string | null;
  account?: string | null;
  query?: string | null;
  source?: string | null;
}): Promise<LoadAdjacentPostsResult> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return { ok: false, error: ws.error };
  const ctx = ws.ctx;
  const userId = ctx.resourceUserId;
  const workspaceId = ctx.workspaceId;

  const postId = input?.postId;
  if (!postId || typeof postId !== "string") {
    return { ok: false, error: "BadRequest" };
  }

  const detail = await getPostDetail(postId, userId, workspaceId);
  if (!detail) return { ok: false, error: "NotFound" };

  const statusFilter = toStatusFilter(input.statusFilter);
  const time = input.time || null;

  const adjacent = await getAdjacentPostIds(postId, userId, {
    workspaceId,
    statusFilter,
    sort: input.sort === "oldest" ? "oldest" : "newest",
    platform: input.platform || null,
    time,
    account: input.account || null,
    query: typeof input.query === "string" ? input.query : null,
    source: typeof input.source === "string" ? input.source : null,
    timeZone: await postsFilterTimeZone(time, ctx.actorUserId),
  });
  return { ok: true, data: adjacent };
}

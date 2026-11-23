import {
  and,
  desc,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { addDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { db } from "@/db";
import {
  apiKeys,
  connectedAccounts,
  postPublications,
  posts,
  queueSlots,
  teamInvitations,
  teamMembers,
  teams,
  userSettings,
} from "@/db/schema";
import { getPlanLimits, NEVER_EXPIRES_PLATFORMS } from "@social0/shared";
import { getSubscriptionForUser } from "@/lib/subscription";
import { isValidIanaTimezone } from "@/lib/resolve-scheduled-at";
import { requireWorkspaceSession } from "@/lib/workspace/session";
import {
  connectionScopeCondition,
  postScopeCondition,
  type WorkspaceContext,
} from "@/lib/workspace/context";
import type { TeamPermissionsDto } from "@/lib/workspace/permissions";
import {
  agentSourceCondition,
  buildPostSourceDtos,
  type PostSourceDto,
} from "@/lib/post-source";
import { isMcpConnectorKeyName } from "@/lib/mcp-oauth";
import { accountReconnectedAtSql } from "@/lib/account-reconnect";
import {
  idlePublicationSqlFor,
  isPostPublishingStale,
  postPublishingStaleSql,
} from "@/lib/stuck-publishing";
import {
  classifyPublicationError,
  type PublicationErrorKind,
} from "@/lib/publication-error-kind";

/**
 * `dashboard.getHome`: everything the Home page needs in one round trip.
 *
 * DB only — no platform API calls, no Redis — so it stays fast enough to be
 * the landing page. Scoped like every other dashboard read: the active
 * workspace (or the personal pool) of the signed-in user.
 */

const FAILED_WINDOW_DAYS = 14;
const TODAY_LIMIT = 50;
const FAILED_LIMIT = 10;
const REVIEW_LIMIT = 5;
const ACTIVITY_LIMIT = 10;
const SNIPPET_LENGTH = 140;

export type HomePublication = {
  publicationId: string;
  connectedAccountId: string | null;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  /** pending | publishing | published | failed */
  status: string | null;
  platformPostUrl: string | null;
  publishedAt: string | null;
  error: string | null;
  errorKind: PublicationErrorKind | null;
};

export type HomePost = {
  id: string;
  /** First line of the caption, trimmed. */
  snippet: string;
  /** draft | scheduled | publishing | published | partial | failed */
  status: string;
  scheduledAt: string | null;
  createdAt: string | null;
  /**
   * Last change: for a draft sent with "Publish now" (no scheduledAt) this is
   * when it was sent or finalized, so Today can place it.
   */
  updatedAt: string | null;
  /** Earliest publication time, when anything went out. */
  publishedAt: string | null;
  failureReason: string | null;
  failureKind: PublicationErrorKind | null;
  source: PostSourceDto;
  publications: HomePublication[];
  /** Publications that went out / total targets ("2 of 3 delivered"). */
  delivered: number;
  total: number;
};

export type HomeReconnectAccount = {
  accountId: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  /**
   * token_expired: the health sweep marked the token dead.
   * publish_auth_failed: a recent publish failed with an auth error.
   */
  reason: "token_expired" | "publish_auth_failed";
  /** Scheduled posts that target this account and will fail until reconnected. */
  scheduledPostsAffected: number;
};

export type HomeActivityItem = {
  id: string;
  type: "created" | "published" | "failed";
  at: string;
  postId: string;
  snippet: string;
  postStatus: string;
  platform: string | null;
  platformUsername: string | null;
  platformPostUrl: string | null;
  error: string | null;
  errorKind: PublicationErrorKind | null;
  source: PostSourceDto;
};

export type HomeSetupState = {
  hasAccounts: boolean;
  hasPublished: boolean;
  /** Any active API key (includes the MCP connector key). */
  hasApiKey: boolean;
  hasMcpConnection: boolean;
  /** hasApiKey || hasMcpConnection: "Connect an AI agent" is done. */
  hasAgent: boolean;
  hasQueueSlots: boolean;
  /** Teammates who joined (excluding the owner). */
  teammates: number;
  pendingInvites: number;
  /** teammates > 0 || pendingInvites > 0 */
  hasInvitedTeammate: boolean;
  /** Plan allows Teams; the invite step is optional and hidden when false. */
  teamsAvailable: boolean;
};

export type DashboardHomeData = {
  generatedAt: string;
  /** IANA zone used for "today" (the user's setting, UTC when unset/invalid). */
  timezone: string;
  /** Today in that zone, yyyy-MM-dd. */
  today: string;
  /** The user's clock preference ("14:30" vs "2:30 PM"). */
  use24HourTimeFormat: boolean;
  workspace: {
    id: string | null;
    name: string | null;
    teamId: string | null;
    teamName: string | null;
  };
  permissions: TeamPermissionsDto;
  counts: {
    /** Every draft, including the ones awaiting review. */
    drafts: number;
    /** Drafts created by an API key or MCP host. */
    needsReview: number;
    scheduled: number;
    /** Scheduled and still due in the future (overdue ones are excluded). */
    upcoming: number;
    /** Still in flight: not finished and not stuck (see effectiveStatus). */
    publishing: number;
    /** Failed (incl. stuck or finished-but-unfinalized), updated in the last 14 days. */
    failed: number;
    /** Partly published (incl. finished-but-unfinalized), updated in the last 14 days. */
    partial: number;
  };
  /** Posts scheduled for or published today, in time order. */
  todayPosts: HomePost[];
  /** Failed and partly published posts from the last 14 days, newest first. */
  failedPosts: HomePost[];
  /** Agent drafts awaiting review, newest first (total in counts.needsReview). */
  reviewPosts: HomePost[];
  reconnectAccounts: HomeReconnectAccount[];
  recentActivity: HomeActivityItem[];
  setup: HomeSetupState;
};

export type GetHomeResult =
  | { ok: true; data: DashboardHomeData }
  | { ok: false; error: string };

type PostRow = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  failureReason: string | null;
  metadata: unknown;
  createdByUserId: string | null;
};

const postColumns = {
  id: posts.id,
  originalContent: posts.originalContent,
  status: posts.status,
  scheduledAt: posts.scheduledAt,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
  failureReason: posts.failureReason,
  metadata: posts.metadata,
  createdByUserId: posts.createdByUserId,
};

function snippetOf(content: string | null): string {
  const firstLine = (content ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!firstLine) return "";
  return firstLine.length > SNIPPET_LENGTH
    ? `${firstLine.slice(0, SNIPPET_LENGTH - 1)}…`
    : firstLine;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/**
 * A "publishing" delivery that is still running: not idle by
 * `idlePublicationSql` (lib/stuck-publishing.ts), the rule the publish engine
 * uses to take one over. A publish run skips such a delivery as "already in
 * progress" and only takes over idle ones, so while one is running a Retry
 * would do nothing and the post must not read as stuck yet.
 */
export function runningPublicationSql(pub: { status: SQLWrapper; updatedAt: SQLWrapper; createdAt: SQLWrapper }): SQL {
  return sql`(${pub.status} = 'publishing'
    and (${idlePublicationSqlFor(pub)}) is not true)`;
}

/**
 * What a post really is right now. A "publishing" post whose deliveries all
 * finished (finalize never ran) reads as published / partial / failed, and one
 * still "publishing" after `STUCK_PUBLISHING_MINUTES` (lib/stuck-publishing.ts,
 * the same rule as the posts list, post detail and the publish engine) is
 * stuck and reads as failed with a Retry, unless a delivery is still running
 * (`deliveryRunning`, see runningPublicationSql): Retry could not take it over
 * yet. `homeStatusSql` below is the SQL twin: keep them in step, or Today, the
 * counts and Needs attention disagree.
 */
export function effectiveStatus(
  row: Pick<PostRow, "status" | "createdAt" | "scheduledAt" | "updatedAt">,
  pubs: HomePublication[],
  deliveryRunning: boolean,
  now: Date,
): string {
  const s = row.status ?? "draft";
  if (s !== "publishing") return s;
  if (pubs.length > 0) {
    if (pubs.every((p) => p.status === "published")) return "published";
    const anyOpen = pubs.some(
      (p) => p.status === "pending" || p.status === "publishing",
    );
    if (!anyOpen) {
      return pubs.some((p) => p.status === "published") ? "partial" : "failed";
    }
  }
  if (!deliveryRunning && isPostPublishingStale(row, now.getTime())) {
    return "failed";
  }
  return s;
}

/**
 * A delivery of this post that `loadPublications` returns (its account still
 * exists), optionally narrowed by `cond` on alias `pp`.
 */
function pubExists(cond?: SQL): SQL {
  return sql`exists (
    select 1 from ${postPublications} pp
    where pp.post_id = ${posts.id}
      and pp.connected_account_id is not null
      ${cond ? sql`and ${cond}` : sql``}
  )`;
}

/** SQL twin of `effectiveStatus`, for the counts and the Needs attention list. */
export const homeStatusSql = (() => {
  const publishing = sql`${posts.status} = 'publishing'`;
  const settled = sql`(${pubExists()} and not ${pubExists(sql`pp.status in ('pending', 'publishing')`)})`;
  const anyPublished = pubExists(sql`pp.status = 'published'`);
  const anyNotPublished = pubExists(sql`pp.status is distinct from 'published'`);
  const stuck = sql`(coalesce(${postPublishingStaleSql}, false)
    and not ${pubExists(
      runningPublicationSql({
        status: sql`pp.status`,
        updatedAt: sql`pp.updated_at`,
        createdAt: sql`pp.created_at`,
      }),
    )})`;
  return {
    /** Still running: no finished delivery set and not stuck yet. */
    publishing: sql`(${publishing} and not ${settled} and not ${stuck})`,
    failed: sql`(${posts.status} = 'failed' or (${publishing} and (
      (${settled} and not ${anyPublished}) or (not ${settled} and ${stuck})
    )))`,
    partial: sql`(${posts.status} = 'partial' or (${publishing} and ${settled} and ${anyPublished} and ${anyNotPublished}))`,
  };
})();

function isTokenExpired(platform: string, tokenStatus: string | null): boolean {
  if (NEVER_EXPIRES_PLATFORMS.has(platform)) return false;
  return tokenStatus === "expired";
}

/** Start and end (exclusive) of "today" in `timezone`, as UTC instants. */
function todayWindow(timezone: string, now: Date) {
  const zoned = toZonedTime(now, timezone);
  const startLocal = new Date(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: fromZonedTime(startLocal, timezone),
    end: fromZonedTime(addDays(startLocal, 1), timezone),
    label: `${startLocal.getFullYear()}-${pad(startLocal.getMonth() + 1)}-${pad(startLocal.getDate())}`,
  };
}

/**
 * Raw `sql` params skip drizzle's column mapping, and node-postgres would send
 * a Date in the server's local zone. Columns are `timestamp` (UTC values), so
 * always bind an explicit UTC ISO string.
 */
function utc(d: Date): string {
  return d.toISOString();
}

async function loadCounts(ctx: WorkspaceContext, since: Date) {
  const recent = sql`coalesce(${posts.updatedAt}, ${posts.createdAt}) >= ${utc(since)}`;
  // Mirrors effectiveStatus: a "publishing" post whose deliveries are all done
  // (finalize never ran) or that is stuck is not in flight, so it must not
  // count or keep Home polling; it counts as failed / partial instead.
  const [row] = await db
    .select({
      drafts: sql<number>`(count(*) filter (where ${posts.status} = 'draft'))::int`,
      needsReview: sql<number>`(count(*) filter (where ${posts.status} = 'draft' and ${agentSourceCondition()}))::int`,
      scheduled: sql<number>`(count(*) filter (where ${posts.status} = 'scheduled'))::int`,
      upcoming: sql<number>`(count(*) filter (where ${posts.status} = 'scheduled' and ${posts.scheduledAt} > ${utc(new Date())}))::int`,
      publishing: sql<number>`(count(*) filter (where ${homeStatusSql.publishing}))::int`,
      failed: sql<number>`(count(*) filter (where ${homeStatusSql.failed} and ${recent}))::int`,
      partial: sql<number>`(count(*) filter (where ${homeStatusSql.partial} and ${recent}))::int`,
      everPublished: sql<boolean>`coalesce(bool_or(${posts.status} in ('published', 'partial')), false)`,
    })
    .from(posts)
    .where(postScopeCondition(ctx));
  return {
    counts: {
      drafts: row?.drafts ?? 0,
      needsReview: row?.needsReview ?? 0,
      scheduled: row?.scheduled ?? 0,
      upcoming: row?.upcoming ?? 0,
      publishing: row?.publishing ?? 0,
      failed: row?.failed ?? 0,
      partial: row?.partial ?? 0,
    },
    /** Feeds the setup checklist's "publish your first post" step. */
    hasPublished: !!row?.everPublished,
  };
}

async function loadPublications(postIds: string[]) {
  if (postIds.length === 0) {
    return { byPost: new Map<string, HomePublication[]>(), running: new Set<string>() };
  }
  const rows = await db
    .select({
      postId: postPublications.postId,
      publicationId: postPublications.id,
      connectedAccountId: postPublications.connectedAccountId,
      status: postPublications.status,
      platformPostUrl: postPublications.platformPostUrl,
      publishedAt: postPublications.publishedAt,
      lastError: postPublications.lastError,
      platform: connectedAccounts.platform,
      platformUsername: connectedAccounts.platformUsername,
      profileImageUrl: connectedAccounts.profileImageUrl,
      tokenStatus: connectedAccounts.tokenStatus,
      running: sql<boolean>`${runningPublicationSql(postPublications)}`,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(inArray(postPublications.postId, postIds))
    .orderBy(asc(postPublications.createdAt));

  const out = new Map<string, HomePublication[]>();
  /** Posts with a delivery still running (see runningPublicationSql). */
  const running = new Set<string>();
  for (const r of rows) {
    if (r.running) running.add(r.postId);
    const list = out.get(r.postId) ?? [];
    list.push({
      publicationId: r.publicationId,
      connectedAccountId: r.connectedAccountId,
      platform: r.platform,
      platformUsername: r.platformUsername,
      profileImageUrl: r.profileImageUrl,
      status: r.status,
      platformPostUrl: r.platformPostUrl,
      publishedAt: iso(r.publishedAt),
      error: r.status === "failed" ? r.lastError : null,
      errorKind: classifyPublicationError({
        error: r.lastError,
        status: r.status ?? "pending",
        tokenStatus: r.tokenStatus,
        platform: r.platform,
      }),
    });
    out.set(r.postId, list);
  }
  return { byPost: out, running };
}

async function loadSetup(
  ctx: WorkspaceContext,
  hasAccounts: boolean,
  hasPublished: boolean,
): Promise<HomeSetupState> {
  const now = new Date();
  const [keys, slots, subscription, team] = await Promise.all([
    // API keys are personal credentials of whoever is signed in.
    db
      .select({ name: apiKeys.name })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.userId, ctx.actorUserId),
          isNull(apiKeys.revokedAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(queueSlots)
      .where(
        and(
          eq(queueSlots.userId, ctx.resourceUserId),
          eq(queueSlots.isActive, true),
        ),
      ),
    getSubscriptionForUser(ctx.resourceUserId),
    loadTeammateCounts(ctx, now),
  ]);

  const hasApiKey = keys.length > 0;
  const hasMcpConnection = keys.some((k) => isMcpConnectorKeyName(k.name));
  return {
    hasAccounts,
    hasPublished,
    hasApiKey,
    hasMcpConnection,
    hasAgent: hasApiKey || hasMcpConnection,
    hasQueueSlots: (slots[0]?.count ?? 0) > 0,
    teammates: team.teammates,
    pendingInvites: team.pendingInvites,
    hasInvitedTeammate: team.teammates > 0 || team.pendingInvites > 0,
    teamsAvailable: getPlanLimits(subscription.tier).allowTeams,
  };
}

/**
 * Inside a team workspace: that team. In the personal pool: the user's own
 * collaborative teams (where "invite a teammate" would land).
 */
async function loadTeammateCounts(
  ctx: WorkspaceContext,
  now: Date,
): Promise<{ teammates: number; pendingInvites: number }> {
  const teamIds = ctx.teamId
    ? [ctx.teamId]
    : (
        await db
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(
              eq(teams.ownerUserId, ctx.actorUserId),
              eq(teams.isCollaborative, true),
            ),
          )
      ).map((t) => t.id);
  if (teamIds.length === 0) return { teammates: 0, pendingInvites: 0 };

  const ownerId = ctx.ownerUserId ?? ctx.actorUserId;
  const [[members], [invites]] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${teamMembers.userId})::int` })
      .from(teamMembers)
      .where(
        and(inArray(teamMembers.teamId, teamIds), ne(teamMembers.userId, ownerId)),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(teamInvitations)
      .where(
        and(
          inArray(teamInvitations.teamId, teamIds),
          isNull(teamInvitations.acceptedAt),
          isNull(teamInvitations.revokedAt),
          gt(teamInvitations.expiresAt, now),
        ),
      ),
  ]);
  return {
    teammates: members?.count ?? 0,
    pendingInvites: invites?.count ?? 0,
  };
}

type ActivityPubRow = PostRow & {
  publicationId: string;
  pubStatus: string | null;
  at: Date | null;
  lastError: string | null;
  platform: string;
  platformUsername: string | null;
  platformPostUrl: string | null;
  tokenStatus: string | null;
};

async function loadActivityPublications(
  ctx: WorkspaceContext,
  kind: "published" | "failed",
): Promise<ActivityPubRow[]> {
  const at =
    kind === "published"
      ? postPublications.publishedAt
      : // Decode through the column (zone-less timestamp = UTC) so failed
        // items sort against published ones; a raw string would be parsed in
        // the server's local zone.
        (sql`coalesce(${postPublications.updatedAt}, ${postPublications.createdAt})`.mapWith(
          postPublications.updatedAt,
        ) as SQL<Date | null>);
  const rows = await db
    .select({
      ...postColumns,
      publicationId: postPublications.id,
      pubStatus: postPublications.status,
      at,
      lastError: postPublications.lastError,
      platform: connectedAccounts.platform,
      platformUsername: connectedAccounts.platformUsername,
      platformPostUrl: postPublications.platformPostUrl,
      tokenStatus: connectedAccounts.tokenStatus,
    })
    .from(postPublications)
    .innerJoin(posts, eq(postPublications.postId, posts.id))
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        postScopeCondition(ctx),
        eq(postPublications.status, kind),
        kind === "published" ? isNotNull(postPublications.publishedAt) : undefined,
      ),
    )
    .orderBy(
      kind === "published"
        ? desc(postPublications.publishedAt)
        : desc(sql`coalesce(${postPublications.updatedAt}, ${postPublications.createdAt})`),
    )
    .limit(ACTIVITY_LIMIT);
  return rows;
}

/**
 * Accounts whose publishes failed on auth in the window and haven't recovered
 * since. A failure stops counting once the account is reconnected after it
 * (`platform_metadata.reconnectedAt`, see lib/account-reconnect.ts; never
 * `updated_at`, which token refreshes and the health sweep bump) or once a
 * later delivery from the same account published.
 */
async function loadAuthFailedAccountIds(
  ctx: WorkspaceContext,
  since: Date,
): Promise<Set<string>> {
  const failedAt = sql`coalesce(${postPublications.updatedAt}, ${postPublications.createdAt})`;
  const rows = await db
    .select({
      accountId: postPublications.connectedAccountId,
      lastError: postPublications.lastError,
      tokenStatus: connectedAccounts.tokenStatus,
      platform: connectedAccounts.platform,
    })
    .from(postPublications)
    .innerJoin(posts, eq(postPublications.postId, posts.id))
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        postScopeCondition(ctx),
        eq(postPublications.status, "failed"),
        sql`${failedAt} >= ${utc(since)}`,
        sql`${failedAt} >= ${accountReconnectedAtSql}`,
        sql`not exists (
          select 1 from ${postPublications} as later
          join ${posts} as lp on lp.id = later.post_id
          where lp.user_id = ${ctx.resourceUserId}
            and later.connected_account_id = ${postPublications.connectedAccountId}
            and later.status = 'published'
            and later.published_at > ${failedAt}
        )`,
      ),
    )
    .orderBy(desc(failedAt))
    .limit(200);
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.accountId) continue;
    const kind = classifyPublicationError({
      error: r.lastError,
      status: "failed",
      tokenStatus: r.tokenStatus,
      platform: r.platform,
    });
    if (kind === "reconnect") out.add(r.accountId);
  }
  return out;
}

/** The viewer's timezone (UTC when unset/invalid) and clock preference, in one read. */
async function getViewerTimePrefs(
  userId: string,
): Promise<{ timezone: string; use24HourTimeFormat: boolean }> {
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { timezone: true, use24HourTimeFormat: true },
  });
  const tz = row?.timezone?.trim();
  return {
    timezone: tz && isValidIanaTimezone(tz) ? tz : "UTC",
    use24HourTimeFormat: row?.use24HourTimeFormat ?? false,
  };
}

export async function getHome(): Promise<GetHomeResult> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return { ok: false, error: ws.error };
  const ctx = ws.ctx;

  const now = new Date();
  const { timezone, use24HourTimeFormat } = await getViewerTimePrefs(ctx.actorUserId);
  const day = todayWindow(timezone, now);
  const since = addDays(now, -FAILED_WINDOW_DAYS);
  const scope = postScopeCondition(ctx);

  // Home is the landing page and fires alongside the layout RPCs, so its reads
  // run in small waves (at most ~5 queries in flight) rather than one fan-out
  // that would hold most of the shared pg pool for a single request.
  const [
    { counts, hasPublished },
    todayRows,
    failedRows,
    reviewRows,
    accounts,
  ] = await Promise.all([
    loadCounts(ctx, since),
    db
      .select(postColumns)
      .from(posts)
      .where(
        and(
          scope,
          ne(posts.status, "draft"),
          or(
            and(gte(posts.scheduledAt, day.start), lt(posts.scheduledAt, day.end)),
            sql`exists (
              select 1 from ${postPublications}
              where ${postPublications.postId} = ${posts.id}
                and ${postPublications.publishedAt} >= ${utc(day.start)}
                and ${postPublications.publishedAt} < ${utc(day.end)}
            )`,
            // A draft sent with "Publish now" keeps scheduled_at NULL (only a
            // new post in "now" mode stamps it), so it would miss both
            // branches above while in flight or after failing everywhere.
            // Its updated_at is when it was sent / finalized; in-flight ones
            // always show, even across midnight.
            and(
              isNull(posts.scheduledAt),
              or(
                homeStatusSql.publishing,
                sql`coalesce(${posts.updatedAt}, ${posts.createdAt}) >= ${utc(day.start)}
                  and coalesce(${posts.updatedAt}, ${posts.createdAt}) < ${utc(day.end)}`,
              ),
            ),
          ),
        ),
      )
      .orderBy(
        asc(sql`coalesce(${posts.scheduledAt}, ${posts.updatedAt}, ${posts.createdAt})`),
      )
      .limit(TODAY_LIMIT),
    db
      .select(postColumns)
      .from(posts)
      .where(
        and(
          scope,
          or(homeStatusSql.failed, homeStatusSql.partial),
          sql`coalesce(${posts.updatedAt}, ${posts.createdAt}) >= ${utc(since)}`,
        ),
      )
      .orderBy(desc(sql`coalesce(${posts.updatedAt}, ${posts.createdAt})`))
      .limit(FAILED_LIMIT),
    db
      .select(postColumns)
      .from(posts)
      .where(and(scope, eq(posts.status, "draft"), agentSourceCondition()))
      .orderBy(desc(posts.createdAt))
      .limit(REVIEW_LIMIT),
    db
      .select({
        id: connectedAccounts.id,
        platform: connectedAccounts.platform,
        platformUsername: connectedAccounts.platformUsername,
        profileImageUrl: connectedAccounts.profileImageUrl,
        tokenStatus: connectedAccounts.tokenStatus,
        isActive: connectedAccounts.isActive,
      })
      .from(connectedAccounts)
      .where(connectionScopeCondition(ctx)),
  ]);

  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  const homePostRows = [...todayRows, ...failedRows, ...reviewRows];

  // loadSetup peaks at ~5 queries itself (teammate counts fan out after the
  // team lookup), so it gets a wave of its own.
  const setup = await loadSetup(ctx, activeAccounts.length > 0, hasPublished);

  const [createdRows, publishedRows, failedPubRows, authFailedIds, loadedPubs] =
    await Promise.all([
      db
        .select(postColumns)
        .from(posts)
        .where(scope)
        .orderBy(desc(posts.createdAt))
        .limit(ACTIVITY_LIMIT),
      loadActivityPublications(ctx, "published"),
      loadActivityPublications(ctx, "failed"),
      loadAuthFailedAccountIds(ctx, since),
      loadPublications([...new Set(homePostRows.map((r) => r.id))]),
    ]);

  const allPostRows: PostRow[] = [
    ...homePostRows,
    ...createdRows,
    ...publishedRows,
    ...failedPubRows,
  ];
  const uniqueById = new Map(allPostRows.map((r) => [r.id, r]));

  const expiredIds = new Set(
    activeAccounts
      .filter((a) => isTokenExpired(a.platform, a.tokenStatus))
      .map((a) => a.id),
  );

  const reconnectCandidates = activeAccounts.filter(
    (a) => expiredIds.has(a.id) || authFailedIds.has(a.id),
  );

  const [sources, affectedRows] = await Promise.all([
    buildPostSourceDtos([...uniqueById.values()], {
      actorUserId: ctx.actorUserId,
      ownerUserId: ctx.resourceUserId,
    }),
    reconnectCandidates.length > 0
      ? db
          .select({
            accountId: postPublications.connectedAccountId,
            count: sql<number>`count(distinct ${posts.id})::int`,
          })
          .from(postPublications)
          .innerJoin(posts, eq(postPublications.postId, posts.id))
          .where(
            and(
              scope,
              eq(posts.status, "scheduled"),
              inArray(
                postPublications.connectedAccountId,
                reconnectCandidates.map((a) => a.id),
              ),
            ),
          )
          .groupBy(postPublications.connectedAccountId)
      : Promise.resolve([] as Array<{ accountId: string | null; count: number }>),
  ]);
  const affectedByAccount = new Map(
    affectedRows.map((r) => [r.accountId, r.count]),
  );

  const toHomePost = (row: PostRow): HomePost => {
    const pubs = loadedPubs.byPost.get(row.id) ?? [];
    const status = effectiveStatus(row, pubs, loadedPubs.running.has(row.id), now);
    const publishedTimes = pubs
      .map((p) => p.publishedAt)
      .filter((t): t is string => !!t)
      .sort();
    return {
      id: row.id,
      snippet: snippetOf(row.originalContent),
      status,
      scheduledAt: iso(row.scheduledAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      publishedAt: publishedTimes[0] ?? null,
      failureReason:
        status === "failed" || status === "partial" ? row.failureReason : null,
      failureKind:
        (status === "failed" || status === "partial") && row.failureReason
          ? classifyPublicationError({ error: row.failureReason })
          : null,
      source: sources.get(row.id)!,
      publications: pubs,
      delivered: pubs.filter((p) => p.status === "published").length,
      total: pubs.length,
    };
  };

  type DraftActivity = Omit<HomeActivityItem, "at"> & { at: string | null };
  const activity: HomeActivityItem[] = [
    ...createdRows.map((r): DraftActivity => ({
      id: `created:${r.id}`,
      type: "created" as const,
      at: iso(r.createdAt),
      postId: r.id,
      snippet: snippetOf(r.originalContent),
      postStatus: r.status ?? "draft",
      platform: null,
      platformUsername: null,
      platformPostUrl: null,
      error: null,
      errorKind: null,
      source: sources.get(r.id)!,
    })),
    ...[...publishedRows, ...failedPubRows].map((r): DraftActivity => ({
      id: `${r.pubStatus}:${r.publicationId}`,
      type: (r.pubStatus === "failed" ? "failed" : "published") as
        | "published"
        | "failed",
      at: iso(r.at),
      postId: r.id,
      snippet: snippetOf(r.originalContent),
      postStatus: r.status ?? "draft",
      platform: r.platform,
      platformUsername: r.platformUsername,
      platformPostUrl: r.pubStatus === "published" ? r.platformPostUrl : null,
      error: r.pubStatus === "failed" ? r.lastError : null,
      errorKind:
        r.pubStatus === "failed"
          ? classifyPublicationError({
              error: r.lastError,
              status: "failed",
              tokenStatus: r.tokenStatus,
              platform: r.platform,
            })
          : null,
      source: sources.get(r.id)!,
    })),
  ]
    .filter((a): a is HomeActivityItem => a.at !== null)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, ACTIVITY_LIMIT);

  return {
    ok: true,
    data: {
      generatedAt: now.toISOString(),
      timezone,
      today: day.label,
      use24HourTimeFormat,
      workspace: {
        id: ctx.workspaceId,
        name: ctx.workspaceName,
        teamId: ctx.teamId,
        teamName: ctx.teamName,
      },
      permissions: ctx.permissionsDto,
      counts,
      todayPosts: todayRows.map(toHomePost),
      failedPosts: failedRows.map(toHomePost),
      reviewPosts: reviewRows.map(toHomePost),
      reconnectAccounts: reconnectCandidates.map((a) => ({
        accountId: a.id,
        platform: a.platform,
        platformUsername: a.platformUsername,
        profileImageUrl: a.profileImageUrl,
        reason: expiredIds.has(a.id) ? "token_expired" : "publish_auth_failed",
        scheduledPostsAffected: affectedByAccount.get(a.id) ?? 0,
      })),
      recentActivity: activity,
      setup,
    },
  };
}

import { rpc } from "@/lib/rpc";
import { fetchApi } from "@/lib/fetch-api";
import { toClientErrorMessage } from "@/lib/client-error-message";

/*
 * Typed wrappers for the dashboard redesign RPCs (`dashboard.*`) plus the
 * shared shapes other wrappers reuse (post source, error kind, tab counts).
 * Mirrors backend/server/src/services/dashboard-home.ts, dashboard-agents.ts,
 * lib/post-source.ts and lib/publication-error-kind.ts. Never import those
 * directly: the SPA builds alone.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/**
 * Which fix a failed publication needs:
 * - "reconnect": token expired / revoked or missing permission → Reconnect & retry
 * - "content": the platform rejected the post (length, media, format) → Edit for <network>
 * - "plan": blocked by plan / payment → Upgrade / fix payment
 * - "interrupted": publishing stopped before the network answered; the post
 *   may already be live → check, then Retry
 * - "transient": anything else (timeouts, 5xx, rate limits) → Retry
 */
export type PublicationErrorKind = "reconnect" | "content" | "transient" | "plan" | "interrupted";

/**
 * Who created a post. Chip label:
 * - kind "user" + isCurrentUser → "You"; kind "user" → userName ?? "Teammate"
 * - kind "mcp" → `${client ?? "AI agent"} · MCP`
 * - kind "api_key" + client "cli" → `CLI · ${keyName}`; otherwise `API · ${keyName}`
 * Drafts with kind "api_key" | "mcp" are "Needs review".
 */
export type PostSourceDto = {
  kind: "user" | "api_key" | "mcp";
  userId: string | null;
  userName: string | null;
  isCurrentUser: boolean;
  keyId: string | null;
  keyName: string | null;
  /** api_key: "cli" | "api". mcp: host app name (e.g. "ChatGPT") or null. */
  client: string | null;
};

/** Posts tab counts (all list filters applied except status). */
export type PostsStatusCounts = {
  all: number;
  /** Every draft, including the ones awaiting review. */
  drafts: number;
  /** Drafts created by an API key or MCP host. */
  needsReview: number;
  /** drafts - needsReview: drafts made in the dashboard. */
  userDrafts: number;
  scheduled: number;
  publishing: number;
  published: number;
  partial: number;
  failed: number;
};

/**
 * Posts list status filter values accepted by `loadPostsPageData`.
 * - "posted" = published only (legacy tab); "published" = published + partly published.
 * - "draft" = every draft (legacy); "user_draft" = drafts not awaiting review;
 *   "needs_review" = drafts an API key / MCP host created.
 */
export type PostsStatusFilter =
  | "scheduled"
  | "posted"
  | "published"
  | "draft"
  | "user_draft"
  | "needs_review"
  | "failed"
  | null;

/** True for drafts an agent created (shown under "Needs review"). */
export function isAgentSource(source: PostSourceDto | null | undefined): boolean {
  return source?.kind === "api_key" || source?.kind === "mcp";
}

// ---------------------------------------------------------------------------
// dashboard.getHome
// ---------------------------------------------------------------------------

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
  /** Only set when status is "failed". */
  error: string | null;
  errorKind: PublicationErrorKind | null;
};

export type HomePost = {
  id: string;
  /** First line of the caption, trimmed (may be "" for media-only posts). */
  snippet: string;
  /** draft | scheduled | publishing | published | partial | failed */
  status: string;
  scheduledAt: string | null;
  createdAt: string | null;
  /** When a draft sent with "Publish now" (no scheduledAt) was sent or finalized. */
  updatedAt: string | null;
  publishedAt: string | null;
  failureReason: string | null;
  failureKind: PublicationErrorKind | null;
  source: PostSourceDto;
  publications: HomePublication[];
  /** "2 of 3 delivered" */
  delivered: number;
  total: number;
};

export type HomeReconnectAccount = {
  accountId: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  reason: "token_expired" | "publish_auth_failed";
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
  hasApiKey: boolean;
  hasMcpConnection: boolean;
  /** "Connect an AI agent" is done. */
  hasAgent: boolean;
  hasQueueSlots: boolean;
  teammates: number;
  pendingInvites: number;
  hasInvitedTeammate: boolean;
  /** Plan allows Teams; hide the optional invite step when false. */
  teamsAvailable: boolean;
};

export type HomePermissions = {
  canInvite: boolean;
  canRemoveMembers: boolean;
  canChangeRoles: boolean;
  canManageConnections: boolean;
  canManageWorkspaceSettings: boolean;
  canAccessBilling: boolean;
  canCreatePosts: boolean;
  canEditPosts: boolean;
  canDeletePosts: boolean;
  canPublishPosts: boolean;
  canViewConnections: boolean;
  canViewAnalytics: boolean;
  canViewInbox: boolean;
  canReplyComments: boolean;
  canReplyDms: boolean;
};

export type DashboardHomeData = {
  generatedAt: string;
  /** IANA zone used for "today". */
  timezone: string;
  /** yyyy-MM-dd in that zone. */
  today: string;
  /** The user's clock preference ("14:30" vs "2:30 PM"); absent on older servers. */
  use24HourTimeFormat?: boolean;
  workspace: {
    id: string | null;
    name: string | null;
    teamId: string | null;
    teamName: string | null;
  };
  permissions: HomePermissions;
  counts: {
    /** Every draft, including needs-review ones. */
    drafts: number;
    needsReview: number;
    scheduled: number;
    /** Scheduled and still due in the future. Missing from older API builds. */
    upcoming?: number;
    publishing: number;
    /** Failed in the last 14 days. */
    failed: number;
    /** Partly published in the last 14 days. */
    partial: number;
  };
  /** Scheduled for or published today, in time order (max 50). */
  todayPosts: HomePost[];
  /** Failed + partly published, last 14 days, newest first (max 10). */
  failedPosts: HomePost[];
  /** Agent drafts awaiting review, newest first (max 5; total in counts.needsReview). */
  reviewPosts: HomePost[];
  reconnectAccounts: HomeReconnectAccount[];
  /** Newest first, max 10. */
  recentActivity: HomeActivityItem[];
  setup: HomeSetupState;
  // No "best post" yet: analytics are live platform reads and Home must stay
  // DB-only. Compute it client-side from analytics.getOverview if needed.
};

export type GetHomeResult =
  | { ok: true; data: DashboardHomeData }
  | { ok: false; error: string };

/** Everything Home needs in one DB-only call (no platform API reads). */
export function getHome(): Promise<GetHomeResult> {
  return rpc("dashboard.getHome");
}

// ---------------------------------------------------------------------------
// dashboard.listAgentConnections
// ---------------------------------------------------------------------------

export type AgentConnection = {
  keyId: string;
  name: string;
  keyPrefix: string;
  /** "mcp_connector" = the OAuth key an MCP host (ChatGPT, Claude…) uses. */
  kind: "mcp_connector" | "api_key";
  clientName: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  postsCreated: number;
  lastPostAt: string | null;
};

export type ListAgentConnectionsResult =
  | {
      ok: true;
      data: {
        connections: AgentConnection[];
        mcpClient: { clientName: string | null; connectedAt: string } | null;
      };
    }
  | { ok: false; error: string };

/**
 * Active API keys of the signed-in user with MCP host labels and posts
 * created per key. Revoke with `revokeApiKey` (disconnects the MCP host when
 * it is the connector key).
 */
export function listAgentConnections(): Promise<ListAgentConnectionsResult> {
  return rpc("dashboard.listAgentConnections");
}

// ---------------------------------------------------------------------------
// dashboard.listAutomations
// ---------------------------------------------------------------------------

export type AutomationAutoPlug = {
  id: string;
  postId: string;
  postSnippet: string;
  /** watching | triggered | expired | failed */
  status: string;
  metricType: string;
  metricThreshold: number;
  plugComment: string;
  connectedAccountId: string;
  platformUsername: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AutomationResurface = {
  id: string;
  postId: string;
  postSnippet: string;
  platform: string;
  isActive: boolean;
  intervalHours: number;
  maxResurfaces: number;
  resurfacesDone: number;
  plugComment: string | null;
  runsDone: number;
  runsFailed: number;
  lastRunAt: string | null;
  lastRunStatus: "done" | "failed" | null;
  nextRunAt: string | null;
  createdAt: string | null;
};

/** Scheduled post that will set up Auto-Plug / Auto-Repost after X publishes. */
export type AutomationPending = {
  postId: string;
  postSnippet: string;
  scheduledAt: string | null;
  autoPlug: { metricType: string; threshold: number; plugComment: string } | null;
  autoRepost: {
    intervalHours: number;
    maxResurfaces: number;
    plugComment: string | null;
  } | null;
};

export type ListAutomationsResult =
  | {
      ok: true;
      data: {
        autoPlugs: AutomationAutoPlug[];
        resurfaces: AutomationResurface[];
        pending: AutomationPending[];
        stats: {
          autoPlugsWatching: number;
          autoPlugsTriggered: number;
          autoPlugsFailed: number;
          resurfacesActive: number;
          resurfaceRunsDone: number;
          resurfaceRunsFailed: number;
          pending: number;
        };
        plan: {
          allowAutoPlug: boolean;
          allowResurface: boolean;
          allowBulkTools: boolean;
        };
        /** Role can change automations (edit_posts). */
        canEdit: boolean;
      };
    }
  | { ok: false; error: string };

/**
 * Per-post automations in the current workspace (latest 100 of each kind).
 * Toggle with the existing mutations in `@/api/resurface` and
 * `updateScheduledPostAutoFeatures` in `@/api/posts`.
 */
export function listAutomations(): Promise<ListAutomationsResult> {
  return rpc("dashboard.listAutomations");
}

async function readJsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(toClientErrorMessage(text, fallback));
  }
  return (await res.json()) as T;
}

/** `DELETE /api/api-keys/:id`. Resolves when revoked (idempotent). */
export async function revokeApiKey(keyId: string): Promise<void> {
  const res = await fetchApi(`/api/api-keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
  });
  await readJsonOrThrow<{ ok: true }>(res, "Couldn't revoke this key. Try again.");
}

export type WebhookSubscriptionPatch = {
  active?: boolean;
  events?: string[];
  url?: string;
};

/** `PATCH /api/webhooks/subscriptions/:id`: pause/resume, change events or URL. */
export async function updateWebhookSubscription(
  id: string,
  patch: WebhookSubscriptionPatch,
): Promise<{
  subscription: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
    updatedAt: string | null;
  };
}> {
  const res = await fetchApi(
    `/api/webhooks/subscriptions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  return readJsonOrThrow(res, "Couldn't update this webhook. Try again.");
}

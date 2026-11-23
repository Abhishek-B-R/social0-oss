/**
 * Pure helpers shared by the Posts table, cards and the post detail page:
 * row hydration, tab ↔ status filter mapping, display type, "first line"
 * titles, source labels, timestamps and per-delivery problem copy.
 */
import { formatInTimeZone } from "date-fns-tz";
import {
  getPostSourceFromDto,
  networkLabel,
  toPillStatus,
  type PillStatus,
  type PostSourceInfo,
} from "@/components/app";
import type {
  LoadPostsPageDataResult,
} from "@/api/dashboard-data";
import type {
  PostSourceDto,
  PostsStatusCounts,
  PostsStatusFilter,
  PublicationErrorKind,
} from "@/api/dashboard";
import { POSTS_TABS, type PostsTab } from "@/lib/dashboard-routes";
import { formatDate, formatDateTime } from "@/lib/date-format";
import {
  enrichTwitterErrorForDisplay,
  isTwitterPlatformId,
} from "@/lib/twitter-errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PostsPageData = Extract<LoadPostsPageDataResult, { ok: true }>["data"];
type RawPost = PostsPageData["userPosts"][number];
type RawPublication = PostsPageData["publicationsByPostId"][string][number];

export type FirstMediaMeta = {
  mimeType: string;
  originalFilename: string | null;
  url: string | null;
  thumbnailUrl: string | null;
};

export type ListPublication = Omit<RawPublication, "publishedAt"> & {
  publishedAt: Date | null;
};

export type DisplayType = "Text" | "Image" | "Video" | "Thread" | "Collection";

/** One row of the Posts list, ready to render. */
export type PostListItem = {
  id: string;
  /** Raw API status (draft | scheduled | publishing | published | partial | failed). */
  status: string;
  /** Status after the "stuck publishing" check. */
  uiStatus: string;
  pill: PillStatus;
  isAgentDraft: boolean;
  isQueued: boolean;
  /** Queue slot the post holds, when queued (null when unknown). */
  queueSlotId: string | null;
  originalContent: string | null;
  title: string;
  hasCaption: boolean;
  /** Thread parts (1 for normal posts). */
  partCount: number;
  displayType: DisplayType;
  mediaIds: string[];
  firstMedia: FirstMediaMeta | null;
  metadata: Record<string, unknown> | null;
  scheduledAt: Date | null;
  createdAt: Date | null;
  failureReason: string | null;
  failureKind: PublicationErrorKind | null;
  source: PostSourceInfo;
  publications: ListPublication[];
  /** Distinct connected account ids (for duplicate / reschedule). */
  accountIds: string[];
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const TAB_STATUS_FILTER: Record<PostsTab, PostsStatusFilter> = {
  all: null,
  drafts: "user_draft",
  review: "needs_review",
  scheduled: "scheduled",
  published: "published",
  failed: "failed",
};

export function parsePostsTab(raw: string | null | undefined): PostsTab {
  return (POSTS_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as PostsTab)
    : "all";
}

export function tabCount(
  tab: PostsTab,
  counts: PostsStatusCounts | undefined,
): number | null {
  if (!counts) return null;
  switch (tab) {
    case "all":
      return counts.all;
    case "drafts":
      return counts.userDrafts;
    case "review":
      return counts.needsReview;
    case "scheduled":
      return counts.scheduled;
    case "published":
      return counts.published + counts.partial;
    case "failed":
      return counts.failed;
  }
}

/** Which tab a post belongs to (breadcrumb on the detail page). */
export function tabForStatus(status: string | null, isAgentDraft: boolean): PostsTab {
  switch (status) {
    case "draft":
      return isAgentDraft ? "review" : "drafts";
    case "scheduled":
      return "scheduled";
    case "published":
    case "partial":
      return "published";
    case "failed":
      return "failed";
    default:
      return "all";
  }
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

/** Chip info from the server's resolved source (falls back to metadata). */
export function sourceFromDto(
  dto: PostSourceDto | null | undefined,
  metadata: unknown,
): PostSourceInfo {
  return getPostSourceFromDto(dto, metadata);
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export type ThreadPart = { text: string; mediaIds: string[] };

/** Thread parts from metadata.twitterThread or "---" separators; one part otherwise. */
export function getThreadParts(
  originalContent: string | null,
  metadata: Record<string, unknown> | null,
): ThreadPart[] {
  const thread = asRecord(metadata?.twitterThread);
  const parts = thread?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    return parts.map((p) => {
      const rec = asRecord(p);
      return {
        text: String(rec?.text ?? "").trim(),
        mediaIds: Array.isArray(rec?.mediaIds)
          ? (rec.mediaIds as unknown[]).filter((x): x is string => typeof x === "string")
          : [],
      };
    });
  }
  const raw = originalContent ?? "";
  const segments = raw
    .split(/\n\s*---\s*\n|\s+---\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length > 1) return segments.map((text) => ({ text, mediaIds: [] }));
  return [{ text: raw.trim(), mediaIds: [] }];
}

export function getDisplayType(input: {
  metadata: Record<string, unknown> | null;
  partCount: number;
  mediaCount: number;
  firstMime: string;
  /** Detail page: any video in the media list. */
  hasVideo?: boolean;
}): DisplayType {
  switch (input.metadata?.contentType) {
    case "threads":
      return "Thread";
    case "collection":
      return "Collection";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "text":
      return "Text";
  }
  if (input.partCount > 1) return "Thread";
  if (input.mediaCount > 1) return "Collection";
  if (input.hasVideo || input.firstMime.startsWith("video/")) return "Video";
  if (input.mediaCount === 1) return "Image";
  return "Text";
}

/** First non-empty line, trimmed to a table-friendly length. */
export function firstLine(text: string | null | undefined, max = 120): string {
  const line =
    (text ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Untitled fallback per type, for media-only posts. */
export function untitledLabel(type: DisplayType): string {
  switch (type) {
    case "Image":
      return "Image post";
    case "Video":
      return "Video post";
    case "Collection":
      return "Carousel post";
    case "Thread":
      return "Thread";
    default:
      return "No caption";
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Mirrors `STUCK_PUBLISHING_MS` in backend/server/src/lib/stuck-publishing.ts:
 * the posts list, post detail and the publish engine's takeover of a dead
 * delivery all use it. Showing a Retry any earlier offers one that cannot take
 * the delivery over yet and only skips it as "already in progress".
 */
export const STUCK_PUBLISHING_MINUTES = 15;
const STUCK_PUBLISHING_MS = STUCK_PUBLISHING_MINUTES * 60 * 1000;

/**
 * A post that has said "publishing" for `STUCK_PUBLISHING_MINUTES` is stuck:
 * show it as failed so it gets a Retry. Measured from the latest of created, scheduled
 * and last-updated time: publishing an old draft or retrying an old failed
 * post bumps `updatedAt`, so a run that just started never reads as stuck.
 */
export function effectiveStatus(
  status: string | null,
  times: { createdAt: Date | null; scheduledAt: Date | null; updatedAt?: Date | null },
  now = Date.now(),
): string {
  const s = status ?? "draft";
  if (s !== "publishing") return s;
  const ref = Math.max(
    times.createdAt?.getTime() ?? 0,
    times.scheduledAt?.getTime() ?? 0,
    times.updatedAt?.getTime() ?? 0,
  );
  if (ref > 0 && now - ref > STUCK_PUBLISHING_MS) return "failed";
  return s;
}

export function pillFor(uiStatus: string, isAgentDraft: boolean): PillStatus {
  return toPillStatus(uiStatus, { isAgentDraft });
}

/** "Live" / "Failed" / "Scheduled"… for one delivery row. */
export function deliveryPill(
  pubStatus: string | null,
  postStatus: string,
): { status: PillStatus; label: string } {
  if (pubStatus === "published") return { status: "published", label: "Live" };
  if (pubStatus === "failed") return { status: "failed", label: "Failed" };
  if (pubStatus === "publishing" || pubStatus === "processing" || postStatus === "publishing") {
    return { status: "publishing", label: "Publishing" };
  }
  if (postStatus === "scheduled") return { status: "scheduled", label: "Scheduled" };
  if (postStatus === "draft" || postStatus === "failed") return { status: "draft", label: "Not sent" };
  return { status: "draft", label: "Pending" };
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hydratePublication(p: RawPublication): ListPublication {
  return { ...p, publishedAt: toDate(p.publishedAt) };
}

export function hydratePostsPage(data: PostsPageData): PostListItem[] {
  const queued = new Set(data.queuedPostIds);
  return data.userPosts.map((p: RawPost) => {
    const metadata = asRecord(p.metadata);
    const createdAt = toDate(p.createdAt);
    const scheduledAt = toDate(p.scheduledAt);
    const updatedAt = toDate(p.updatedAt);
    const publications = (data.publicationsByPostId[p.id] ?? []).map(hydratePublication);
    const firstMedia = data.firstMediaByPost[p.id] ?? null;
    const mediaIds = p.mediaIds ?? [];
    const parts = getThreadParts(p.originalContent, metadata);
    const displayType = getDisplayType({
      metadata,
      partCount: parts.length,
      mediaCount: mediaIds.length,
      firstMime: firstMedia?.mimeType ?? "",
    });
    const source = sourceFromDto(p.source, metadata);
    const status = p.status ?? "draft";
    const uiStatus = effectiveStatus(status, { createdAt, scheduledAt, updatedAt });
    const isAgentDraft = uiStatus === "draft" && source.isAgent;
    const title = firstLine(parts[0]?.text ?? p.originalContent);
    return {
      id: p.id,
      status,
      uiStatus,
      pill: pillFor(uiStatus, isAgentDraft),
      isAgentDraft,
      isQueued: queued.has(p.id),
      queueSlotId: data.queuedSlotByPostId?.[p.id] ?? null,
      originalContent: p.originalContent,
      title: title || untitledLabel(displayType),
      hasCaption: !!title,
      partCount: parts.length,
      displayType,
      mediaIds,
      firstMedia,
      metadata,
      scheduledAt,
      createdAt,
      failureReason: p.failureReason,
      failureKind: p.failureKind ?? null,
      source,
      publications,
      accountIds: [
        ...new Set(
          publications
            .map((pub) => pub.connectedAccountId)
            .filter((id): id is string => !!id),
        ),
      ],
    };
  });
}

/** Unique network names in publication order ("X, Threads, Bluesky"). */
export function networkNames(pubs: { platform: string }[]): string {
  return [...new Set(pubs.map((p) => networkLabel(p.platform)))].join(", ");
}

/** Second line under a row's title. */
export function rowSubline(item: PostListItem): string {
  const bits: string[] = [];
  if (item.displayType === "Thread" && item.partCount > 1) bits.push(`${item.partCount} posts`);
  else if (item.displayType === "Collection" && item.mediaIds.length > 1)
    bits.push(`${item.mediaIds.length} files`);
  else if (item.displayType !== "Text") bits.push(item.displayType);

  const terminal = item.publications.some(
    (p) => p.status === "published" || p.status === "failed",
  );
  if (terminal && item.publications.length > 0) {
    const delivered = item.publications.filter((p) => p.status === "published").length;
    bits.push(`${delivered} of ${item.publications.length} delivered`);
  } else if (item.publications.length > 0) {
    bits.push(networkNames(item.publications));
  } else {
    bits.push("No accounts");
  }
  return bits.join(" · ");
}

/** Status for the NetworkStack dot: no dot until something was attempted. */
export function stackStatus(pubStatus: string | null, postUiStatus: string): string | null {
  if (postUiStatus === "draft" || postUiStatus === "scheduled") return null;
  if (pubStatus === "pending" && postUiStatus !== "publishing") return null;
  return pubStatus;
}

/** NetworkStack items for a row: one icon per account with its delivery dot. */
export function rowNetworkItems(item: PostListItem) {
  return item.publications.map((p) => ({
    key: p.publicationId,
    network: p.platform,
    status: stackStatus(p.status, item.uiStatus),
    hint: p.platformUsername ? `@${p.platformUsername.replace(/^@/, "")}` : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type TimeOpts = {
  timezone: string | null;
  use24HourTimeFormat: boolean;
  dateFormat: string | null;
};

function safeTz(tz: string | null): string {
  const t = tz?.trim();
  if (!t) return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: t });
    return t;
  } catch {
    return "UTC";
  }
}

export function userTimezone(tz: string | null): string {
  return safeTz(tz);
}

/** Short time for tables: "Today 9:15 AM", "Tue 2:00 PM", "12 Oct", "12/10/2025". */
export function formatWhen(date: Date, opts: TimeOpts, now = new Date()): string {
  const tz = safeTz(opts.timezone);
  const time = formatInTimeZone(date, tz, opts.use24HourTimeFormat ? "HH:mm" : "h:mm a");
  const dayKey = (d: Date) => formatInTimeZone(d, tz, "yyyy-MM-dd");
  const day = dayKey(date);
  const dayMs = 24 * 60 * 60 * 1000;
  if (day === dayKey(now)) return `Today ${time}`;
  if (day === dayKey(new Date(now.getTime() + dayMs))) return `Tomorrow ${time}`;
  if (day === dayKey(new Date(now.getTime() - dayMs))) return `Yesterday ${time}`;
  const diff = Math.abs(date.getTime() - now.getTime());
  if (diff < 6 * dayMs) return `${formatInTimeZone(date, tz, "EEE")} ${time}`;
  if (formatInTimeZone(date, tz, "yyyy") === formatInTimeZone(now, tz, "yyyy")) {
    return formatInTimeZone(date, tz, "d MMM");
  }
  return formatDate(date, opts.dateFormat, tz);
}

/** Full date + time in the user's format (tooltips, properties). */
export function formatFull(date: Date, opts: TimeOpts): string {
  return formatDateTime(date, {
    timezone: opts.timezone,
    dateFormat: opts.dateFormat,
    use24HourTimeFormat: opts.use24HourTimeFormat,
  });
}

export function earliestPublishedAt(pubs: { publishedAt: Date | null }[]): Date | null {
  let min: number | null = null;
  for (const p of pubs) {
    const t = p.publishedAt?.getTime();
    if (t != null && (min == null || t < min)) min = t;
  }
  return min == null ? null : new Date(min);
}

/** "Queue · Tue 9:00" for queued posts, the plain time otherwise. */
export function queuePrefixed(item: PostListItem, text: string): string {
  return item.uiStatus === "scheduled" && item.isQueued ? `Queue · ${text}` : text;
}

/** The time a row shows, with what it means. */
export function rowWhen(item: PostListItem): { date: Date | null; label: string } {
  switch (item.uiStatus) {
    case "scheduled":
      return { date: item.scheduledAt, label: item.isQueued ? "Queued for" : "Scheduled for" };
    case "published":
    case "partial":
      return {
        date: earliestPublishedAt(item.publications) ?? item.scheduledAt ?? item.createdAt,
        label: "Published",
      };
    case "failed":
    case "publishing":
      return { date: item.scheduledAt ?? item.createdAt, label: "Publish time" };
    default:
      return { date: item.createdAt, label: "Created" };
  }
}

// ---------------------------------------------------------------------------
// Delivery problems
// ---------------------------------------------------------------------------

export type DeliveryFix = "reconnect" | "edit" | "retry" | "upgrade";

export type DeliveryProblem = {
  /** Plain-language one-liner ("TikTok sign-in expired."). */
  headline: string;
  /** What to do next, or the platform's own message for content errors. */
  hint: string;
  /** The platform's raw error, when it adds something beyond the hint. */
  detail: string | null;
  fix: DeliveryFix;
};

export function displayError(platform: string, error: string | null | undefined): string | null {
  const e = error?.trim();
  if (!e) return null;
  return isTwitterPlatformId(platform) ? enrichTwitterErrorForDisplay(e) : e;
}

/**
 * Plain-language problem + the fix that matches the error kind:
 * reconnect → Reconnect & retry, content → Edit for <network>,
 * plan → Upgrade, anything else → Retry.
 *
 * A sign-in failure only turns into "connected again, Retry" when the server
 * saw the account re-authorized after this delivery failed
 * (`reconnectedSinceFailure`) and the account is still healthy. A healthy
 * `token_status` alone proves nothing: nothing on the publish path flips it,
 * so a dead token reads as healthy until the health sweep runs.
 */
export function deliveryProblem(
  pub: {
    platform: string;
    lastError: string | null;
    errorKind?: PublicationErrorKind | null;
    reconnectedSinceFailure?: boolean;
  },
  opts: { accountHealthy?: boolean } = {},
): DeliveryProblem {
  const network = networkLabel(pub.platform);
  const raw = displayError(pub.platform, pub.lastError);
  switch (pub.errorKind) {
    case "reconnect":
      if (pub.reconnectedSinceFailure && opts.accountHealthy) {
        return {
          headline: `${network} sign-in had expired.`,
          hint: "The account is connected again. Retry to publish.",
          detail: raw,
          fix: "retry",
        };
      }
      return {
        headline: `${network} sign-in expired.`,
        hint: "Reconnect, then retry. Other networks aren't affected.",
        detail: raw,
        fix: "reconnect",
      };
    case "content":
      return {
        headline: `${network} rejected this post.`,
        hint: raw ?? `Change the post for ${network}, then publish it again.`,
        detail: null,
        fix: "edit",
      };
    case "interrupted":
      // Not "temporary, retry": the post may be live, and a blind retry
      // would publish it twice.
      return {
        headline: `${network} may already have this post.`,
        hint: `Publishing stopped before ${network} confirmed it. Check ${network}, and retry only if the post isn't there.`,
        detail: null,
        fix: "retry",
      };
    case "plan":
      return {
        headline: "Blocked by your plan.",
        hint: "Your plan is inactive or out of posts. Upgrade, then retry.",
        detail: raw,
        fix: "upgrade",
      };
    default:
      return {
        headline: `${network} didn't accept the post this time.`,
        hint: "This is usually temporary. Retry in a moment.",
        detail: raw,
        fix: "retry",
      };
  }
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------

/** Metadata safe to copy into a new draft: no pipeline claims, no source. */
export function metadataForCopy(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (k.startsWith("_") || k === "source") continue;
    out[k] = v;
  }
  return out;
}

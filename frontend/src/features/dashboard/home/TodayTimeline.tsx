import type { DashboardHomeData, HomePost } from "@/api/dashboard";
import Link from "@/components/AppLink";
import {
  EmptyState,
  NetworkStack,
  StatusPill,
  networkLabel,
  openComposer,
  toPillStatus,
  useDashboardPath,
  type NetworkStackItem,
  type PillStatus,
} from "@/components/app";
import { dayKey, formatTz, joinNetworks, postTitle, timePattern } from "./home-format";
import { CardHeader, HomeCard } from "./HomeCard";

type Line = {
  post: HomePost;
  at: string | null;
  items: NetworkStackItem[];
  pill: PillStatus;
  pillLabel?: string;
};

/**
 * When a sent post went out today. `post.publishedAt` is the earliest delivery
 * ever, which is yesterday for a post that went out late last night and had
 * one network retried this morning; Today must show this morning's time.
 */
function wentOutToday(post: HomePost, timezone: string, today: string): string | null {
  const times = post.publications
    .map((p) => p.publishedAt)
    .filter((t): t is string => !!t && dayKey(t, timezone) === today)
    .sort();
  // A draft sent with "Publish now" has no scheduledAt: until something goes
  // out (or if nothing does), place it by when it was sent / finalized.
  return times[0] ?? post.publishedAt ?? post.scheduledAt ?? post.updatedAt ?? post.createdAt;
}

function toLine(post: HomePost, atRisk: Set<string>, timezone: string, today: string): Line {
  const at = post.status === "scheduled" ? post.scheduledAt : wentOutToday(post, timezone, today);
  const riskyPlatforms = post.publications
    .filter(
      (p) =>
        p.connectedAccountId &&
        atRisk.has(p.connectedAccountId) &&
        p.status !== "published" &&
        p.status !== "failed",
    )
    .map((p) => p.platform);
  const items: NetworkStackItem[] = post.publications.map((p) => ({
    network: p.platform,
    key: p.publicationId,
    hint: p.platformUsername ? `@${p.platformUsername.replace(/^@/, "")}` : undefined,
    status:
      p.connectedAccountId && atRisk.has(p.connectedAccountId) && p.status !== "published"
        ? "warning"
        : p.status,
  }));

  const pill = toPillStatus(post.status);
  const live = post.total > 0 ? `Live ${post.delivered}/${post.total}` : undefined;
  switch (pill) {
    case "published":
    case "partly_published":
      return { post, at, items, pill, pillLabel: live };
    case "failed":
    case "publishing":
      return { post, at, items, pill };
    default:
      if (riskyPlatforms.length) {
        const names = joinNetworks(riskyPlatforms);
        return {
          post,
          at,
          items,
          pill: "sign_in_expired",
          pillLabel: riskyPlatforms.length === 1 ? `${networkLabel(riskyPlatforms[0])} at risk` : `${names} at risk`,
        };
      }
      return { post, at, items, pill };
  }
}

/**
 * Today's posts in time order: time, title, networks, and a status pill only
 * when the state is worth reading (a scheduled post's time already says it).
 */
export function TodayTimeline({ data }: { data: DashboardHomeData }) {
  const dash = useDashboardPath();
  const atRisk = new Set(data.reconnectAccounts.map((a) => a.accountId));
  // Order by the time each row shows: the server sorts by scheduled/created
  // time, but a retried or draft-published post shows when it went out today.
  // ISO strings sort chronologically; rows without a time go last.
  const lines = data.todayPosts
    .map((p) => toLine(p, atRisk, data.timezone, data.today))
    .sort((a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : a.at ? -1 : b.at ? 1 : 0));
  const canCreate = data.permissions.canCreatePosts;
  const scheduled = data.counts.scheduled;
  const upcoming = data.counts.upcoming ?? scheduled;
  const overdue = scheduled - upcoming;

  return (
    <HomeCard aria-labelledby="home-today-title">
      <CardHeader id="home-today-title" title="Today" link={{ href: dash("calendar"), label: "Calendar" }} />
      {lines.length === 0 ? (
        scheduled === 0 ? (
          <EmptyState
            compact
            className="pb-0 pt-2"
            title="Nothing scheduled yet."
            primaryAction={canCreate ? { label: "Write a post", onClick: () => openComposer() } : undefined}
            secondaryAction={canCreate ? { label: "Let my agent post", href: dash("agents") } : undefined}
          />
        ) : (
          <p className="mt-2 text-sm text-text-muted">
            {upcoming > 0 ? "Next: " : null}
            <Link
              href={dash("posts?tab=scheduled")}
              className="font-medium text-text hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {upcoming > 0
                ? `${upcoming} scheduled later`
                : `${overdue} scheduled ${overdue === 1 ? "post is" : "posts are"} past due`}
            </Link>
          </p>
        )
      ) : (
        <ol className="mt-2 divide-y divide-border">
          {lines.map((l) => (
            <li key={l.post.id}>
              <Link
                href={dash(`posts/${l.post.id}`)}
                className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none"
              >
                <span className="w-16 shrink-0 whitespace-nowrap tabular-nums text-text-muted">
                  {l.at ? formatTz(l.at, data.timezone, timePattern(data.use24HourTimeFormat)) : "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-text group-hover:underline">
                  {postTitle(l.post.snippet)}
                </span>
                {l.items.length ? <NetworkStack items={l.items} size={14} max={4} /> : null}
                {l.pill !== "scheduled" ? <StatusPill status={l.pill} label={l.pillLabel} /> : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </HomeCard>
  );
}

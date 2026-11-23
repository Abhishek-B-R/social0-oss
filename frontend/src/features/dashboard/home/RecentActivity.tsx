import { ArrowRight, ExternalLink, MessageCircle } from "lucide-react";
import type { DashboardHomeData, HomeActivityItem } from "@/api/dashboard";
import Link from "@/components/AppLink";
import {
  NetworkIcon,
  RowActions,
  SourceChipView,
  formatBadgeCount,
  isSelfSource,
  networkLabel,
  useDashboardPath,
  useInboxNeedsReplyCount,
} from "@/components/app";
import { getPublicationViewUrl } from "@/lib/platform-view-url";
import { postTitle, shortWhen, sourceInfo } from "./home-format";
import { CardHeader, HomeCard } from "./HomeCard";

/** "Published", "Failed", "Drafted"… The network shows as an icon beside the time. */
function verb(item: HomeActivityItem): string {
  switch (item.type) {
    case "published":
      return "Published";
    case "failed":
      return "Failed";
    default:
      if (item.postStatus === "draft") return "Drafted";
      if (item.postStatus === "scheduled") return "Scheduled";
      return "Created";
  }
}

/**
 * "6 comments and DMs need a reply · Inbox →". The inbox is a live read with
 * no count endpoint, so this uses the same last-known count as the nav
 * badges and stays hidden until the Inbox has loaded once.
 */
function InboxLine({ canViewInbox }: { canViewInbox: boolean }) {
  const dash = useDashboardPath();
  const count = useInboxNeedsReplyCount();
  if (!canViewInbox || !count) return null;
  return (
    <Link
      href={dash("inbox")}
      className="group mt-2 flex items-center gap-2.5 rounded py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <MessageCircle className="size-4 shrink-0 text-info" aria-hidden />
      <span className="min-w-0 flex-1 group-hover:underline">
        <span className="font-semibold tabular-nums">{formatBadgeCount(count)}</span>{" "}
        {count === 1 ? "comment or DM needs a reply" : "comments and DMs need a reply"}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-text-muted group-hover:text-text">
        Inbox
        <ArrowRight className="size-3" aria-hidden />
      </span>
    </Link>
  );
}

/** Who did what (you, a teammate, an agent, an API key), newest first. */
export function RecentActivity({ data }: { data: DashboardHomeData }) {
  const dash = useDashboardPath();
  const items = data.recentActivity;
  const now = new Date();

  return (
    <HomeCard aria-labelledby="home-activity-title">
      <CardHeader id="home-activity-title" title="Recent activity" link={{ href: dash("posts"), label: "All posts" }} />
      <InboxLine canViewInbox={data.permissions.canViewInbox} />
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Nothing yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {items.map((item) => {
            const source = sourceInfo(item.source);
            const external =
              item.type === "published" && item.platform
                ? getPublicationViewUrl({
                    platform: item.platform,
                    status: "published",
                    platformPostUrl: item.platformPostUrl,
                    platformPostId: null,
                    platformUsername: item.platformUsername,
                  })
                : null;
            return (
              <li key={item.id} className="group/row flex items-baseline gap-3 py-2 text-sm">
                <p className="min-w-0 flex-1 truncate">
                  <SourceChipView source={source} iconless className="mr-1.5" />
                  <span className={item.type === "failed" ? "text-danger" : "text-text-muted"}>
                    {isSelfSource(source) ? verb(item) : verb(item).toLowerCase()}
                  </span>{" "}
                  <Link
                    href={dash(`posts/${item.postId}`)}
                    className="text-text hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    {postTitle(item.snippet)}
                  </Link>
                </p>
                <div className="flex shrink-0 items-center gap-2 self-center">
                  {external ? (
                    <RowActions>
                      <a
                        href={external}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View on ${item.platform ? networkLabel(item.platform) : "the network"}`}
                        title={`View on ${item.platform ? networkLabel(item.platform) : "the network"}`}
                        className="rounded p-0.5 text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    </RowActions>
                  ) : null}
                  {item.platform ? <NetworkIcon network={item.platform} size={14} /> : null}
                  <time
                    dateTime={item.at}
                    className="min-w-[4.5rem] whitespace-nowrap text-right text-xs tabular-nums text-text-muted"
                  >
                    {shortWhen(item.at, data.timezone, data.today, data.use24HourTimeFormat, now)}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </HomeCard>
  );
}

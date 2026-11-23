import { useState, type ReactNode } from "react";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import type {
  DashboardHomeData,
  HomePost,
  HomeReconnectAccount,
} from "@/api/dashboard";
import Link from "@/components/AppLink";
import {
  NetworkIcon,
  PILL_STATUS_LABEL,
  networkLabel,
  useAccountHealth,
  useDashboardPath,
} from "@/components/app";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { reconnectUrl } from "@/lib/account-reconnect";
import { capturePostAction } from "@/lib/posthog-events";
import { cn } from "@/lib/utils";
import { publishNow, publishToast, retryPublications } from "@/features/dashboard/posts/post-actions";
import {
  errorKindCopy,
  failedPublications,
  joinNetworks,
  plainError,
  postTitle,
  primaryErrorKind,
  publicationErrorKind,
  sourceInfo,
} from "./home-format";

const MAX_FAILED_ROWS = 4;
const MAX_RECONNECT_ROWS = 3;

type Tone = "danger" | "warning";

const STATUS_TEXT: Record<Tone, string> = {
  danger: "text-danger",
  warning: "text-warning",
};

const fixButtonClass =
  "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-border bg-bg-elevated px-3 text-xs font-medium text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 touch:h-10";

/**
 * One problem and its fix. Only failed / partly published rows lead with a
 * colored status word; everything else is said by the sentence itself.
 */
function Row({
  status,
  children,
  action,
}: {
  status?: { tone: Tone; label: string };
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 sm:flex-nowrap">
      <div className="min-w-0 flex-1 text-sm text-text">
        {status ? (
          <span className={cn("mr-1.5 font-medium", STATUS_TEXT[status.tone])}>{status.label}</span>
        ) : null}
        {children}
      </div>
      {action ? <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div> : null}
    </li>
  );
}

function RetryButton({ post, label }: { post: HomePost; label: string }) {
  const invalidate = useInvalidateQueries();
  const posthog = usePostHog();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const ids = failedPublications(post).map((p) => p.publicationId);
      // Retry only what failed; a post with no publication rows retries whole.
      const result = ids.length ? await retryPublications(post.id, ids) : await publishNow(post.id);
      const t = publishToast(result);
      toast[t.tone](t.message, { description: t.description });
      capturePostAction(posthog, "post_published", {
        source: "home_retry",
        platform_count: ids.length || undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't retry. Try again.");
    } finally {
      setBusy(false);
      invalidate();
    }
  };
  return (
    <button type="button" className={fixButtonClass} disabled={busy} onClick={() => void run()}>
      {busy ? "Retrying…" : label}
    </button>
  );
}

function FailedRow({
  post,
  data,
  reconnectHrefFor,
  isAccountBroken,
}: {
  post: HomePost;
  data: DashboardHomeData;
  reconnectHrefFor: (accountId: string | null, platform: string) => string | null;
  isAccountBroken: (accountId: string) => boolean;
}) {
  const dash = useDashboardPath();
  const failed = failedPublications(post);
  const kind = primaryErrorKind(post, isAccountBroken);
  const networks = joinNetworks(failed.map((p) => p.platform));
  const firstFailed =
    failed.find((p) => publicationErrorKind(p, isAccountBroken) === kind) ?? failed[0] ?? null;
  const reason = plainError(firstFailed?.error ?? post.failureReason) ?? errorKindCopy(kind);
  const perms = data.permissions;
  const detail = dash(`posts/${post.id}`);
  const partial = post.status === "partial";

  let action: ReactNode;
  if (kind === "reconnect") {
    const href = firstFailed
      ? reconnectHrefFor(firstFailed.connectedAccountId, firstFailed.platform)
      : null;
    action =
      href && perms.canManageConnections ? (
        <a href={href} className={fixButtonClass}>
          Reconnect {firstFailed ? networkLabel(firstFailed.platform) : ""}
        </a>
      ) : (
        <Link href={detail} className={fixButtonClass}>
          Open post
        </Link>
      );
  } else if (kind === "plan") {
    action = perms.canAccessBilling ? (
      <Link href={dash("billing")} className={fixButtonClass}>
        See plans
      </Link>
    ) : (
      <Link href={detail} className={fixButtonClass}>
        Open post
      </Link>
    );
  } else if (kind === "interrupted") {
    // No one-click Retry: the post may already be live, so send the person
    // to the post (which says so) to check before retrying.
    action = (
      <Link href={detail} className={fixButtonClass}>
        {firstFailed ? `Check ${networkLabel(firstFailed.platform)}` : "Open post"}
      </Link>
    );
  } else if (kind === "content") {
    action = (
      <Link href={detail} className={fixButtonClass}>
        {firstFailed && perms.canEditPosts ? `Fix for ${networkLabel(firstFailed.platform)}` : "Open post"}
      </Link>
    );
  } else {
    action = perms.canPublishPosts ? (
      <RetryButton
        post={post}
        label={failed.length > 1 ? `Retry ${failed.length}` : firstFailed ? `Retry ${networkLabel(firstFailed.platform)}` : "Retry"}
      />
    ) : (
      <Link href={detail} className={fixButtonClass}>
        Open post
      </Link>
    );
  }

  return (
    <Row
      status={{
        tone: partial ? "warning" : "danger",
        label: partial ? PILL_STATUS_LABEL.partly_published : PILL_STATUS_LABEL.failed,
      }}
      action={action}
    >
      <Link
        href={detail}
        className="font-medium hover:underline focus-visible:underline focus-visible:outline-none"
      >
        “{postTitle(post.snippet)}”
      </Link>
      <span className="text-text-muted">
        {" · "}
        {networks ? `${networks}: ` : ""}
        {reason}
        {partial && post.total > 0 ? ` (${post.delivered} of ${post.total} delivered)` : ""}
      </span>
    </Row>
  );
}

function ReconnectRow({
  account,
  href,
  canManage,
}: {
  account: HomeReconnectAccount;
  href: string;
  canManage: boolean;
}) {
  const handle = account.platformUsername ? `@${account.platformUsername.replace(/^@/, "")}` : "account";
  const affected = account.scheduledPostsAffected;
  return (
    <Row
      action={
        canManage ? (
          <a href={href} className={fixButtonClass}>
            Reconnect
          </a>
        ) : (
          <span className="text-xs text-text-muted">Ask an admin to reconnect</span>
        )
      }
    >
      {/* Plain inline text (not inline-flex) so a long handle wraps with the
          rest of the sentence instead of pushing ": sign-in expired" down. */}
      <NetworkIcon network={account.platform} size={14} className="mr-1.5 align-[-2px]" />
      <span className="font-medium break-words">
        {networkLabel(account.platform)} {handle}
      </span>
      <span className="text-text-muted">
        {account.reason === "token_expired" ? ": sign-in expired." : ": a post just failed to sign in."}
        {affected > 0
          ? ` ${affected} scheduled post${affected === 1 ? "" : "s"} affected.`
          : ""}
      </span>
    </Row>
  );
}

function ReviewRow({ data }: { data: DashboardHomeData }) {
  const dash = useDashboardPath();
  const total = data.counts.needsReview;
  const posts = data.reviewPosts;
  if (total === 0) return null;
  const labels = [...new Set(posts.map((p) => sourceInfo(p.source).label))];
  const who = labels.length === 1 ? labels[0] : "Your AI agents";
  const single = total === 1 && posts[0];
  return (
    <Row
      action={
        <Link
          href={single ? dash(`posts/${posts[0].id}`) : dash("posts?tab=review")}
          className={fixButtonClass}
        >
          Review
        </Link>
      }
    >
      <span className="font-medium">{who}</span>
      <span className="text-text-muted">
        {" "}
        drafted {total} post{total === 1 ? "" : "s"} for you to check
        {single ? `: “${postTitle(posts[0].snippet)}”` : ""}
      </span>
    </Row>
  );
}

/**
 * Only renders when something is wrong. Every row carries its own fix.
 * Order: blocking (free posts used up) → failed posts → reconnects → reviews.
 */
export function NeedsAttention({
  data,
  freePosts,
}: {
  data: DashboardHomeData;
  freePosts: { remaining: number; limit: number } | null;
}) {
  const dash = useDashboardPath();
  const health = useAccountHealth();
  const reconnectHrefFor = (accountId: string | null, platform: string) => {
    if (!accountId) return null;
    const known = health.accounts.find((a) => a.id === accountId);
    return known?.reconnectHref ?? reconnectUrl({ id: accountId, platform });
  };
  // Accounts that still need a reconnect right now. A failed post's
  // "reconnect" comes from its old error text, so once its account is healthy
  // again (it left this set) the row offers Retry instead.
  const brokenAccountIds = new Set([
    ...data.reconnectAccounts.map((a) => a.accountId),
    ...health.accounts.filter((a) => a.health !== "healthy").map((a) => a.id),
  ]);
  const isAccountBroken = (accountId: string) => brokenAccountIds.has(accountId);

  const freeUsedUp = freePosts != null && freePosts.remaining <= 0 ? freePosts : null;
  const failed = data.failedPosts;
  const shownFailed = failed.slice(0, MAX_FAILED_ROWS);
  const failedTotal = Math.max(failed.length, data.counts.failed + data.counts.partial);
  // Partly published posts live in the Published tab, not Failed, so the
  // overflow links count and point at each status separately.
  const shownPartial = shownFailed.filter((p) => p.status === "partial").length;
  const moreFailed = Math.max(0, data.counts.failed - (shownFailed.length - shownPartial));
  const morePartial = Math.max(0, data.counts.partial - shownPartial);
  const reconnects = data.reconnectAccounts;
  const shownReconnects = reconnects.slice(0, MAX_RECONNECT_ROWS);
  const moreReconnects = reconnects.length - shownReconnects.length;
  const reviews = data.counts.needsReview > 0 && data.permissions.canEditPosts ? 1 : 0;
  const items = (freeUsedUp ? 1 : 0) + failedTotal + reconnects.length + reviews;
  if (items === 0) return null;

  return (
    <section
      aria-labelledby="home-attention-title"
      className="rounded-xl border border-border bg-bg-elevated px-4 pb-1.5 pt-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="home-attention-title" className="text-sm font-semibold text-text">
          Needs attention
        </h2>
        <span className="text-xs text-text-muted">
          {items} item{items === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="mt-1 divide-y divide-border">
        {freeUsedUp ? (
          <Row
            action={
              data.permissions.canAccessBilling ? (
                <Link href={dash("billing")} className={fixButtonClass}>
                  Upgrade
                </Link>
              ) : undefined
            }
          >
            You've used all {freeUsedUp.limit} free posts.{" "}
            <span className="text-text-muted">
              {data.permissions.canAccessBilling
                ? "Pick a plan to keep publishing."
                : "Ask the workspace owner to pick a plan."}
            </span>
          </Row>
        ) : null}
        {shownFailed.map((p) => (
          <FailedRow
            key={p.id}
            post={p}
            data={data}
            reconnectHrefFor={reconnectHrefFor}
            isAccountBroken={isAccountBroken}
          />
        ))}
        {shownReconnects.map((a) => (
          <ReconnectRow
            key={a.accountId}
            account={a}
            href={reconnectHrefFor(a.accountId, a.platform) ?? ""}
            canManage={data.permissions.canManageConnections}
          />
        ))}
        {reviews ? <ReviewRow data={data} /> : null}
      </ul>
      {moreReconnects > 0 ? (
        <div className="border-t border-border py-2 text-xs">
          <Link
            href={dash("connections")}
            className="font-medium text-text-muted hover:text-text hover:underline"
          >
            See {moreReconnects} more account{moreReconnects === 1 ? "" : "s"} to reconnect →
          </Link>
        </div>
      ) : null}
      {moreFailed > 0 ? (
        <div className="border-t border-border py-2 text-xs">
          <Link
            href={dash("posts?tab=failed")}
            className="font-medium text-text-muted hover:text-text hover:underline"
          >
            See {moreFailed} more failed post{moreFailed === 1 ? "" : "s"} →
          </Link>
        </div>
      ) : null}
      {morePartial > 0 ? (
        <div className="border-t border-border py-2 text-xs">
          <Link
            href={dash("posts?tab=published")}
            className="font-medium text-text-muted hover:text-text hover:underline"
          >
            See {morePartial} more partly published post{morePartial === 1 ? "" : "s"} →
          </Link>
        </div>
      ) : null}
    </section>
  );
}

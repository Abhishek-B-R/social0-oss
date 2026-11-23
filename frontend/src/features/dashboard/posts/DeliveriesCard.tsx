import type { ReactNode } from "react";
import { ArrowUpRight, Loader2, RotateCw } from "lucide-react";
import Link from "@/components/AppLink";
import { AccountAvatar } from "@/components/AccountAvatar";
import {
  NetworkIcon,
  networkLabel,
  type AccountWithHealth,
  type PillStatus,
} from "@/components/app";
import { reconnectUrl } from "@/lib/account-reconnect";
import { getPublicationViewUrl } from "@/lib/platform-view-url";
import { cn } from "@/lib/utils";
import { rowButtonClass } from "./post-links";
import {
  deliveryPill,
  deliveryProblem,
  formatFull,
  type ListPublication,
  type TimeOpts,
} from "./posts-model";

type DeliveriesCardProps = {
  postStatus: string;
  isQueued: boolean;
  scheduledAt: Date | null;
  publications: ListPublication[];
  /** Publications being retried right now (shown as Publishing). */
  retryingIds: Set<string>;
  healthById: Map<string, AccountWithHealth>;
  canManageConnections: boolean;
  readOnly: boolean;
  timeOpts: TimeOpts;
  /** Composer URL to edit this post (content errors); has a query string. */
  editHref: string;
  billingHref: string;
  onRetry: (publicationIds: string[]) => void;
  /**
   * Called before leaving for a reconnect so the retry can run on return.
   * Gets the account's reconnect URL, returns the URL to navigate to.
   */
  onReconnect: (pub: ListPublication, reconnectHref: string) => string;
};

/** Delivery status as colored text (no pill): problems stand out, the rest stays quiet. */
const STATUS_TEXT: Partial<Record<PillStatus, string>> = {
  failed: "text-danger",
  published: "text-ok",
  publishing: "text-info",
};

function handleFor(pub: ListPublication): string {
  const name = pub.platformUsername?.trim();
  if (!name) return networkLabel(pub.platform);
  if (pub.platform === "tiktok" && /\s/.test(name)) return name;
  return `@${name.replace(/^@/, "")}`;
}

/**
 * Deliveries (mock 06·A): one row per account the post goes to: account,
 * status text, when it went out or why it failed in plain words, and the
 * fix that matches the error. Retry only ever touches failed rows. The
 * header "Retry failed (n)" shows only when more than one row failed (a
 * single failure has its own row action; the page ⋯ menu also retries).
 */
export function DeliveriesCard({
  postStatus,
  isQueued,
  scheduledAt,
  publications,
  retryingIds,
  healthById,
  canManageConnections,
  readOnly,
  timeOpts,
  editHref,
  billingHref,
  onRetry,
  onReconnect,
}: DeliveriesCardProps) {
  const failed = publications.filter((p) => p.status === "failed" && !retryingIds.has(p.publicationId));
  return (
    <section aria-labelledby="deliveries-title" className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 id="deliveries-title" className="text-sm font-semibold text-text">
          Deliveries
        </h2>
        {!readOnly && failed.length > 1 ? (
          <button
            type="button"
            className={rowButtonClass}
            onClick={() => onRetry(failed.map((p) => p.publicationId))}
          >
            <RotateCw className="size-3.5" aria-hidden />
            Retry failed ({failed.length})
          </button>
        ) : null}
      </div>

      {publications.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">
          This post has no accounts. Edit it to pick where it goes.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {publications.map((pub) => {
            const retrying = retryingIds.has(pub.publicationId);
            const pill = retrying
              ? { status: "publishing" as const, label: "Retrying" }
              : deliveryPill(pub.status, postStatus === "scheduled" && isQueued ? "scheduled" : postStatus);
            const viewUrl = getPublicationViewUrl(pub);
            const account = pub.connectedAccountId ? healthById.get(pub.connectedAccountId) : undefined;
            const isFailed = pub.status === "failed" && !retrying;
            const problem = isFailed
              ? deliveryProblem(pub, { accountHealthy: account?.health === "healthy" })
              : null;
            const network = networkLabel(pub.platform);

            let details: ReactNode = null;
            if (retrying) {
              details = <span className="text-text-muted">Retrying now…</span>;
            } else if (problem) {
              details = (
                <>
                  <span className="font-medium text-text">{problem.headline}</span>{" "}
                  <span className="text-text-muted">{problem.hint}</span>
                  {problem.detail && problem.detail !== problem.hint ? (
                    <details className="mt-1 text-xs text-text-muted">
                      <summary className="cursor-pointer select-none hover:text-text">
                        What {network} said
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed">
                        {problem.detail}
                      </p>
                    </details>
                  ) : null}
                </>
              );
            } else if (pub.status === "published") {
              details = (
                <span className="text-text-muted">
                  {pub.publishedAt ? formatFull(pub.publishedAt, timeOpts) : "Published"}
                </span>
              );
            } else if (pill.status === "publishing") {
              details = <span className="text-text-muted">Sending to {network}…</span>;
            } else if (postStatus === "scheduled") {
              details = (
                <span className="text-text-muted">
                  {scheduledAt
                    ? `${isQueued ? "Queued for" : "Goes out"} ${formatFull(scheduledAt, timeOpts)}`
                    : "Waiting for its time"}
                </span>
              );
            } else if (postStatus === "draft") {
              details = <span className="text-text-muted">Not sent yet</span>;
            }

            let action: ReactNode = null;
            if (viewUrl) {
              action = (
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-accent hover:text-accent-hover hover:underline"
                >
                  Open on {network}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              );
            } else if (retrying) {
              action = <Loader2 className="size-4 animate-spin text-text-muted motion-reduce:animate-none" aria-label="Retrying" />;
            } else if (problem && !readOnly) {
              if (problem.fix === "reconnect") {
                const baseHref = pub.connectedAccountId
                  ? (account?.reconnectHref ??
                    reconnectUrl({ id: pub.connectedAccountId, platform: pub.platform }))
                  : null;
                action = canManageConnections && baseHref ? (
                  <a
                    href={baseHref}
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.assign(onReconnect(pub, baseHref));
                    }}
                    className={cn(rowButtonClass, "border-warning-border bg-warning-soft text-warning hover:bg-warning-soft/70")}
                  >
                    Reconnect &amp; retry
                  </a>
                ) : (
                  <span className="text-xs text-text-muted">Ask an admin to reconnect</span>
                );
              } else if (problem.fix === "edit") {
                // Only this account: the others may already be live.
                const href = pub.connectedAccountId
                  ? `${editHref}&accounts=${encodeURIComponent(pub.connectedAccountId)}`
                  : editHref;
                action = (
                  <Link href={href} className={rowButtonClass}>
                    Edit for {network}
                  </Link>
                );
              } else if (problem.fix === "upgrade") {
                action = (
                  <Link href={billingHref} className={rowButtonClass}>
                    Upgrade
                  </Link>
                );
              } else {
                action = (
                  <button type="button" className={rowButtonClass} onClick={() => onRetry([pub.publicationId])}>
                    <RotateCw className="size-3.5" aria-hidden />
                    Retry
                  </button>
                );
              }
            }

            return (
              <li
                key={pub.publicationId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[11rem_5.5rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="relative shrink-0">
                    <AccountAvatar
                      accountId={pub.connectedAccountId ?? undefined}
                      profileImageUrl={pub.profileImageUrl}
                      username={pub.platformUsername}
                      platform={pub.platform}
                      isTwitterPremium={pub.isTwitterPremium ?? false}
                      size="sm"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-bg-elevated ring-2 ring-bg-elevated">
                      <NetworkIcon network={pub.platform} size={11} label="" />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-text">{handleFor(pub)}</span>
                    <span className="block truncate text-xs text-text-muted">{network}</span>
                  </span>
                </div>
                <div
                  className={cn(
                    "justify-self-end text-[13px] font-medium sm:justify-self-start",
                    STATUS_TEXT[pill.status] ?? "text-text-muted",
                  )}
                >
                  {pill.label}
                </div>
                <div className="col-span-2 min-w-0 text-[13px] leading-snug sm:col-span-1">{details}</div>
                {action ? (
                  <div className="col-span-2 flex justify-start sm:col-span-1 sm:justify-end">{action}</div>
                ) : (
                  <div className="hidden sm:block" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import Link from "@/components/AppLink";
import {
  dashboardPathFor,
  NetworkIcon,
  networkLabel,
  useAccountHealth,
} from "@/components/app";
import { reconnectUrl } from "@/lib/account-reconnect";
import { isSafeHttpsLink } from "@/lib/safe-external-url";
import { cn } from "@/lib/utils";
import {
  claimTray,
  hasActiveUploads,
  releaseTray,
  removeTrayJob,
  useTrayJobs,
  useTrayOwner,
  type TrayJob,
  type TrayRow,
} from "./publish-store";
import { retryPublication, rowsResolved } from "./track-publish";
import { deliveryProblem, type DeliveryFix } from "@/features/dashboard/posts/posts-model";

const iconButtonClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:size-11";

/** Small pill actions on each network row. */
const chipClass =
  "inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-9 touch:px-3";

/** Finished cards leave on their own after this long (hover / focus keeps them). */
const AUTO_DISMISS_MS = 8_000;

/**
 * The fix for a failed row, from the server's `errorKind` through the same
 * mapping Deliveries, Posts and Home use, so the tray never offers Reconnect
 * where the post page offers Retry.
 */
function rowFix(row: TrayRow, accountHealthy: boolean): DeliveryFix {
  return deliveryProblem(
    { platform: row.platform, lastError: row.error ?? null, errorKind: row.errorKind ?? null },
    { accountHealthy },
  ).fix;
}

function shortError(row: TrayRow, fix: DeliveryFix): string {
  if (fix === "reconnect") return "sign-in expired";
  if (fix === "upgrade") return "blocked by your plan";
  const e = (row.error ?? "").trim();
  if (!e) return "Failed";
  return e.length > 70 ? `${e.slice(0, 67)}…` : e;
}

/**
 * Bottom-right tray for posts being uploaded, saved and published. Publishing
 * never blocks the composer; this fills in network by network with live
 * links, and stays open with fixes when something fails.
 *
 * Safe to render more than once: only the first mounted instance paints.
 */
export function PublishTray() {
  const [token] = useState(() => Symbol("publish-tray"));
  const owner = useTrayOwner();
  const jobs = useTrayJobs();

  useEffect(() => {
    claimTray(token);
    return () => releaseTray(token);
  }, [token]);
  useEffect(() => {
    if (owner == null) claimTray(token);
  }, [owner, token]);

  const uploading = jobs.some((j) => j.phase === "uploading" || j.phase === "saving");
  useEffect(() => {
    if (!uploading) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!hasActiveUploads()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [uploading]);

  if (owner !== token || jobs.length === 0) return null;

  return (
    <section
      aria-label="Publishing"
      // --bulk-bar-clearance is the open Posts bulk bar's height (0 when
      // closed): stack above it rather than covering its actions.
      className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--bottom-nav-total)+0.75rem+var(--bulk-bar-clearance))] z-40 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-[360px] md:right-5 lg:bottom-[calc(1.25rem+var(--bulk-bar-clearance))]"
    >
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </section>
  );
}

function summary(job: TrayJob): { title: string; tone: "busy" | "ok" | "warn" | "fail" } {
  const total = job.rows.length;
  const failed = job.rows.filter((r) => r.status === "failed").length;
  const live = job.rows.filter((r) => r.status === "published").length;
  const pending = total - failed - live;
  if (job.phase === "uploading") {
    return { title: `Uploading media${job.uploadPercent != null ? ` · ${job.uploadPercent}%` : "…"}`, tone: "busy" };
  }
  if (job.phase === "saving") {
    return {
      title: job.kind === "draft" ? "Saving draft…" : job.kind === "now" ? "Starting publish…" : "Scheduling…",
      tone: "busy",
    };
  }
  if (job.phase === "failed") {
    return { title: job.kind === "draft" ? "Couldn't save the draft" : "Couldn't save the post", tone: "fail" };
  }
  if (job.kind === "draft") return { title: "Saved to drafts", tone: "ok" };
  if (job.kind !== "now") {
    return {
      title: `${job.kind === "queue" ? "Added to queue" : "Scheduled"}${job.scheduledLabel ? ` · ${job.scheduledLabel}` : ""}`,
      tone: "ok",
    };
  }
  if (job.phase === "publishing") {
    return { title: `Publishing to ${total} ${total === 1 ? "account" : "accounts"}`, tone: "busy" };
  }
  // Tracking stopped (time limit, or a retry came back) with networks still
  // waiting or posting: don't call that a success.
  if (pending > 0) {
    return {
      title: `${live} of ${total} live · ${failed > 0 ? `${failed} failed · ` : ""}still checking`,
      tone: "warn",
    };
  }
  if (failed === 0) return { title: `Live on ${live} of ${total}`, tone: "ok" };
  if (live === 0) return { title: `Failed on ${failed === total ? "every" : failed} account${failed === 1 && total > 1 ? "" : "s"}`, tone: "fail" };
  return { title: `${live} of ${total} live · ${failed} failed`, tone: "warn" };
}

function JobCard({ job }: { job: TrayJob }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const health = useAccountHealth();
  const accountFor = useMemo(() => {
    const map = new Map(health.accounts.map((a) => [a.id, a]));
    return (row: TrayRow) => {
      const account = map.get(row.accountId);
      return {
        healthy: account?.health === "healthy",
        reconnectHref:
          account?.reconnectHref ?? reconnectUrl({ id: row.accountId, platform: row.platform }),
      };
    };
  }, [health.accounts]);

  const s = summary(job);
  const postHref = job.postId ? dashboardPathFor(job.basePath, `posts/${job.postId}`) : null;
  const allGood =
    job.phase === "done" &&
    job.kind === "now" &&
    job.rows.length > 0 &&
    job.rows.every((r) => r.status === "published") &&
    !(job.notes?.length);

  // Quietly leave once everything went live, or once a schedule / queue /
  // draft save is confirmed. Hover or focus keeps the card.
  const autoDismiss = allGood || (job.phase === "done" && job.kind !== "now");
  useEffect(() => {
    if (!autoDismiss || hovered) return;
    const t = setTimeout(() => removeTrayJob(job.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [autoDismiss, hovered, job.id]);

  const showRows = job.kind === "now" && job.rows.length > 0 && job.phase !== "failed";

  return (
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="pointer-events-auto overflow-hidden rounded-2xl border border-border bg-bg-elevated text-text shadow-[0_18px_48px_-14px_rgba(0,0,0,0.35)]"
      aria-live="polite"
    >
      <header className="flex items-start gap-2 px-3.5 pt-3">
        <span
          className={cn(
            "mt-px inline-flex shrink-0",
            s.tone === "ok" && "text-ok",
            s.tone === "busy" && "text-text-muted",
            s.tone === "warn" && "text-warning",
            s.tone === "fail" && "text-danger",
          )}
          aria-hidden
        >
          {s.tone === "busy" ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : s.tone === "ok" ? (
            <Check className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{s.title}</p>
          <p className="mt-0.5 truncate text-xs text-text-muted">{job.title}</p>
        </div>
        {showRows ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Show details" : "Hide details"}
            aria-expanded={!collapsed}
            className={iconButtonClass}
          >
            <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", collapsed && "-rotate-90")} aria-hidden />
          </button>
        ) : null}
        {job.phase !== "uploading" && job.phase !== "saving" ? (
          <button
            type="button"
            onClick={() => removeTrayJob(job.id)}
            aria-label="Dismiss"
            className={iconButtonClass}
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </header>

      {job.phase === "uploading" ? (
        <div className="px-3.5 pt-2">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.uploadPercent ?? 0}
            aria-label="Upload progress"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.max(4, job.uploadPercent ?? 0)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            Keep this tab open until the upload finishes. You can keep working.
          </p>
        </div>
      ) : null}

      {showRows && !collapsed ? (
        <ul className="mt-2 space-y-0.5 px-2">
          {job.rows.map((row) => {
            const account = accountFor(row);
            const fix = row.status === "failed" ? rowFix(row, account.healthy) : null;
            return (
              <li key={row.accountId} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                <NetworkIcon network={row.platform} size={14} />
                <span className="min-w-0 flex-1 truncate text-xs">
                  <span className="font-medium">{networkLabel(row.platform)}</span>
                  {fix ? (
                    <span className="text-text-muted" title={row.error ?? undefined}>
                      {" "}
                      · {shortError(row, fix)}
                    </span>
                  ) : (
                    <span className="text-text-muted"> · {row.handle}</span>
                  )}
                </span>
                <RowStatus job={job} row={row} fix={fix} reconnectHref={account.reconnectHref} />
              </li>
            );
          })}
        </ul>
      ) : null}

      {showRows && job.phase === "done" && job.rows.some((r) => r.status === "waiting" || r.status === "processing") ? (
        <p className="mx-3.5 mt-2 text-xs text-text-muted">
          Some networks haven't confirmed yet. Open the post for the final status.
        </p>
      ) : null}

      {job.phase === "failed" && job.error ? (
        <p className="mx-3.5 mt-2 text-xs text-danger" role="alert">
          {job.error}
        </p>
      ) : null}

      {job.notes?.length ? (
        <ul className="mx-3.5 mt-2 space-y-1 text-xs text-text-muted">
          {job.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      <footer className="flex items-center justify-end gap-2 px-3.5 pb-3 pt-2.5">
        {job.phase === "uploading" && job.cancel ? (
          <button
            type="button"
            onClick={job.cancel}
            className="mr-auto text-xs font-medium text-text-muted hover:text-danger"
          >
            Cancel upload
          </button>
        ) : null}
        {job.phase === "failed" && job.reopen ? (
          <button
            type="button"
            onClick={() => {
              job.reopen?.();
              removeTrayJob(job.id);
            }}
            className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10"
          >
            Back to composer
          </button>
        ) : null}
        {postHref && job.phase !== "uploading" && job.phase !== "saving" ? (
          <Link
            href={postHref}
            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium text-text hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10"
          >
            {job.kind === "draft" ? "Open draft" : "View post"}
          </Link>
        ) : null}
      </footer>
    </article>
  );
}

function RowStatus({
  job,
  row,
  fix,
  reconnectHref,
}: {
  job: TrayJob;
  row: TrayRow;
  /** Set for failed rows: the one action that fixes this failure. */
  fix: DeliveryFix | null;
  reconnectHref: string;
}) {
  if (row.status === "published") {
    return row.url && isSafeHttpsLink(row.url) ? (
      <a
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(chipClass, "text-ok hover:bg-ok-soft")}
      >
        Live
        <ExternalLink className="size-3" aria-hidden />
        <span className="sr-only">(opens {networkLabel(row.platform)})</span>
      </a>
    ) : (
      <span className={cn(chipClass, "text-ok")}>
        <Check className="size-3" aria-hidden />
        Live
      </span>
    );
  }
  if (row.status === "failed") {
    const pillClass = cn(chipClass, "bg-bg-muted text-text hover:bg-chip");
    if (fix === "reconnect") {
      return (
        <a href={reconnectHref} className={cn(chipClass, "shrink-0 bg-warning-soft text-warning hover:brightness-95")}>
          Reconnect
          <span className="sr-only"> {networkLabel(row.platform)}</span>
        </a>
      );
    }
    if (!job.postId) return null;
    if (fix === "edit") {
      // The post only becomes editable once every network has settled: until
      // then it is still "publishing" and the composer refuses to open it.
      if (!rowsResolved(job.rows)) {
        return (
          <span
            className={cn(chipClass, "shrink-0 bg-bg-muted text-text-muted opacity-60")}
            aria-disabled="true"
            title="You can edit this post once the other networks finish"
          >
            Edit when done
          </span>
        );
      }
      // Content problems are fixed in the composer; a plain retry would fail again.
      // Only this account: the others may already be live.
      return (
        <Link
          href={dashboardPathFor(
            job.basePath,
            `new?edit=${encodeURIComponent(job.postId)}&accounts=${encodeURIComponent(row.accountId)}`,
          )}
          className={cn(pillClass, "shrink-0")}
        >
          Edit
          <span className="sr-only"> post for {networkLabel(row.platform)}</span>
        </Link>
      );
    }
    if (fix === "upgrade") {
      return (
        <Link href={dashboardPathFor(job.basePath, "billing")} className={cn(pillClass, "shrink-0")}>
          Upgrade
        </Link>
      );
    }
    return (
      <button
        type="button"
        disabled={row.retrying}
        onClick={() => void retryPublication(job.id, job.postId!, row)}
        className={cn(pillClass, "shrink-0 disabled:opacity-50")}
      >
        <RotateCw className={cn("size-3", row.retrying && "animate-spin motion-reduce:animate-none")} aria-hidden />
        Retry
        <span className="sr-only"> {networkLabel(row.platform)}</span>
      </button>
    );
  }
  return (
    <span className={cn(chipClass, "text-text-muted")}>
      {row.status === "processing" ? (
        <>
          <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
          Posting
        </>
      ) : (
        "Waiting"
      )}
    </span>
  );
}

import {
  CalendarClock,
  Copy,
  ExternalLink,
  FileInput,
  MoreHorizontal,
  Pencil,
  Repeat,
  RotateCw,
  Send,
  Trash2,
} from "lucide-react";
import Link from "@/components/AppLink";
import { RowActions, networkLabel, useDashboardPath, type AccountWithHealth } from "@/components/app";
import { reconnectUrl } from "@/lib/account-reconnect";
import { getPublicationViewUrl } from "@/lib/platform-view-url";
import { cn } from "@/lib/utils";
import { ActionMenu, type MenuItem } from "./ActionMenu";
import type { PostNavState } from "./post-nav";
import { editHref, rowQuietClass } from "./post-links";
import { deliveryProblem, type PostListItem } from "./posts-model";
import { rememberRetryAfterReconnect, withReturnTo } from "./reconnect-retry";

export type RowHandlers = {
  onRetry: (item: PostListItem, publicationIds: string[]) => void;
  onPublishNow: (item: PostListItem) => void;
  onPostAgain: (item: PostListItem) => void;
  onDuplicate: (items: PostListItem[]) => void;
  onDelete: (items: PostListItem[]) => void;
  onSchedule: (items: PostListItem[]) => void;
  onReschedule: (items: PostListItem[]) => void;
  onMoveToDrafts: (items: PostListItem[]) => void;
};

type PrimaryAction =
  | { kind: "link"; label: string; href: string; tone?: "primary" | "agent" }
  | {
      kind: "reconnect";
      label: string;
      href: string;
      accountId: string;
      publicationIds: string[];
    }
  | { kind: "button"; label: string; onClick: () => void };

/**
 * The one button a row shows, by state: Review (agent draft), Edit (draft /
 * scheduled), Retry <network> / Reconnect <network> / Fix (failures), View.
 */
function primaryAction(
  item: PostListItem,
  ctx: {
    dash: (s?: string) => string;
    detailHref: string;
    healthById: Map<string, AccountWithHealth>;
    canManageConnections: boolean;
    readOnly: boolean;
    handlers: RowHandlers;
  },
): PrimaryAction {
  const view: PrimaryAction = { kind: "link", label: "View", href: ctx.detailHref };
  if (ctx.readOnly) return view;
  if (item.isAgentDraft) return { kind: "link", label: "Review", href: ctx.detailHref, tone: "agent" };
  if (item.uiStatus === "draft" || item.uiStatus === "scheduled") {
    return { kind: "link", label: "Edit", href: editHref(ctx.dash, item) };
  }
  if (item.uiStatus === "failed" || item.uiStatus === "partial") {
    const failed = item.publications.filter((p) => p.status === "failed");
    if (failed.length === 0) {
      if (item.failureKind === "plan") {
        return { kind: "link", label: "Upgrade", href: ctx.dash("billing") };
      }
      if (item.uiStatus === "failed") {
        return { kind: "button", label: "Retry", onClick: () => ctx.handlers.onPublishNow(item) };
      }
      return view;
    }
    const problems = failed.map((p) => {
      const account = p.connectedAccountId ? ctx.healthById.get(p.connectedAccountId) : undefined;
      return {
        pub: p,
        account,
        problem: deliveryProblem(p, { accountHealthy: account?.health === "healthy" }),
      };
    });
    if (problems.length === 1) {
      const { pub, account, problem } = problems[0]!;
      const network = networkLabel(pub.platform);
      if (problem.fix === "reconnect" && ctx.canManageConnections && pub.connectedAccountId) {
        const href =
          account?.reconnectHref ?? reconnectUrl({ id: pub.connectedAccountId, platform: pub.platform });
        return {
          kind: "reconnect",
          label: `Reconnect ${network}`,
          href,
          accountId: pub.connectedAccountId,
          publicationIds: [pub.publicationId],
        };
      }
      if (problem.fix === "retry") {
        return {
          kind: "button",
          label: `Retry ${network}`,
          onClick: () => ctx.handlers.onRetry(item, [pub.publicationId]),
        };
      }
      return { kind: "link", label: "Fix", href: ctx.detailHref };
    }
    if (problems.every((p) => p.problem.fix === "retry")) {
      return {
        kind: "button",
        label: `Retry failed (${problems.length})`,
        onClick: () => ctx.handlers.onRetry(item, problems.map((p) => p.pub.publicationId)),
      };
    }
    return { kind: "link", label: "Fix", href: ctx.detailHref };
  }
  return view;
}

export function PostRowActions({
  item,
  detailHref,
  navState,
  healthById,
  canManageConnections,
  readOnly,
  handlers,
  busy,
  compact = false,
  reveal = false,
}: {
  item: PostListItem;
  detailHref: string;
  navState: PostNavState;
  healthById: Map<string, AccountWithHealth>;
  canManageConnections: boolean;
  readOnly: boolean;
  handlers: RowHandlers;
  /** A mutation is running on this row. */
  busy?: boolean;
  /** Cards: icon-only ⋯ next to a smaller button. */
  compact?: boolean;
  /**
   * Table rows: actions appear on row hover / focus, except on rows that
   * need you (failed deliveries, agent drafts to review).
   */
  reveal?: boolean;
}) {
  const dash = useDashboardPath();
  const action = primaryAction(item, {
    dash,
    detailHref,
    healthById,
    canManageConnections,
    readOnly,
    handlers,
  });

  const s = item.uiStatus;
  const items: MenuItem[] = [
    { label: "Open", href: detailHref, state: navState, icon: <ExternalLink /> },
  ];
  const liveUrl = item.publications
    .map((p) => getPublicationViewUrl(p))
    .find((u): u is string => !!u);
  if (liveUrl) {
    const pub = item.publications.find((p) => getPublicationViewUrl(p) === liveUrl)!;
    items.push({
      label: `Open on ${networkLabel(pub.platform)}`,
      href: liveUrl,
      external: true,
      icon: <ExternalLink />,
    });
  }
  if (!readOnly) {
    items.push({ kind: "separator" });
    if (s === "draft") {
      items.push(
        { label: "Edit", href: editHref(dash, item), icon: <Pencil /> },
        {
          label: item.isAgentDraft ? "Approve & schedule…" : "Schedule…",
          onSelect: () => handlers.onSchedule([item]),
          disabled: busy,
          icon: <CalendarClock />,
        },
        { label: "Publish now", onSelect: () => handlers.onPublishNow(item), disabled: busy, icon: <Send /> },
      );
    } else if (s === "scheduled") {
      items.push(
        { label: "Edit", href: editHref(dash, item), icon: <Pencil /> },
        {
          label: "Reschedule…",
          onSelect: () => handlers.onReschedule([item]),
          disabled: busy,
          icon: <CalendarClock />,
        },
        { label: "Publish now", onSelect: () => handlers.onPublishNow(item), disabled: busy, icon: <Send /> },
        {
          label: "Move to drafts",
          onSelect: () => handlers.onMoveToDrafts([item]),
          disabled: busy,
          icon: <FileInput />,
        },
      );
    } else if (s === "published" || s === "partial") {
      items.push(
        { label: "Post again", onSelect: () => handlers.onPostAgain(item), icon: <Repeat /> },
        { label: "Edit and post", href: editHref(dash, item), icon: <Pencil /> },
      );
      if (s === "partial") {
        const failedIds = item.publications.filter((p) => p.status === "failed").map((p) => p.publicationId);
        if (failedIds.length > 0) {
          items.push({
            label: `Retry failed (${failedIds.length})`,
            onSelect: () => handlers.onRetry(item, failedIds),
            disabled: busy,
            icon: <RotateCw />,
          });
        }
      }
    } else if (s === "failed") {
      const failedIds = item.publications.filter((p) => p.status === "failed").map((p) => p.publicationId);
      items.push(
        {
          label: "Retry",
          onSelect: () =>
            failedIds.length > 0 ? handlers.onRetry(item, failedIds) : handlers.onPublishNow(item),
          disabled: busy,
          icon: <RotateCw />,
        },
        { label: "Edit and post", href: editHref(dash, item), icon: <Pencil /> },
      );
    }
    items.push(
      { label: "Duplicate", onSelect: () => handlers.onDuplicate([item]), disabled: busy, icon: <Copy /> },
      { kind: "separator" },
      {
        label: "Delete…",
        tone: "danger",
        onSelect: () => handlers.onDelete([item]),
        disabled: busy,
        icon: <Trash2 />,
      },
    );
  }

  const needsYou =
    !readOnly &&
    (item.isAgentDraft ||
      item.uiStatus === "failed" ||
      (item.uiStatus === "partial" && item.publications.some((p) => p.status === "failed")));

  const primaryCls = cn(
    rowQuietClass,
    action.kind === "link" && action.tone === "agent" && "text-agent hover:bg-agent-soft",
    action.kind === "reconnect" && "text-warning hover:bg-warning-soft",
    compact && "h-7 px-2 text-xs",
    // Phones: the ⋯ menu carries the same actions; a labelled button here
    // squeezes the post title to a few characters.
    "max-sm:hidden",
  );

  const content = (
    <>
      {action.kind === "link" ? (
        <Link href={action.href} state={action.href === detailHref ? navState : undefined} className={primaryCls}>
          {action.label}
        </Link>
      ) : action.kind === "reconnect" ? (
        <a
          href={action.href}
          className={primaryCls}
          onClick={(e) => {
            e.preventDefault();
            rememberRetryAfterReconnect({
              postId: item.id,
              accountId: action.accountId,
              publicationIds: action.publicationIds,
            });
            window.location.assign(withReturnTo(action.href, detailHref));
          }}
        >
          {action.label}
        </a>
      ) : (
        <button type="button" onClick={action.onClick} disabled={busy} className={primaryCls}>
          {busy ? "Working…" : action.label}
        </button>
      )}
      <ActionMenu
        aria-label="Post actions"
        items={items}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label="More actions"
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:size-10",
              compact && "size-7",
            )}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        )}
      />
    </>
  );

  if (reveal) {
    return (
      // Keep the ⋯ trigger visible while its menu is open (the menu is portaled).
      <RowActions visible={needsYou} className="has-[[aria-expanded=true]]:opacity-100">
        {content}
      </RowActions>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1" data-row-stop>
      {content}
    </div>
  );
}

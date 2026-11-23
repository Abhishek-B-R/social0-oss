import { AlertCircle } from "lucide-react";
import Link from "@/components/AppLink";
import { NetworkStack, SelectCheckbox, SourceChipView, useDashboardPath } from "@/components/app";
import { cn } from "@/lib/utils";
import { editHref } from "./post-links";
import { PostRowActions } from "./PostRowActions";
import { RowPill, type PostsListViewProps } from "./PostsTable";
import { PostThumb } from "./PostThumb";
import {
  deliveryProblem,
  formatFull,
  formatWhen,
  queuePrefixed,
  rowNetworkItems,
  rowSubline,
  rowWhen,
} from "./posts-model";

/**
 * Card grid for media-heavy users (Table/Cards toggle). Same data, actions
 * and selection as the table, with a large preview.
 */
export function PostsCards({
  items,
  selection,
  readOnly,
  timeOpts,
  navState,
  detailHref,
  healthById,
  canManageConnections,
  handlers,
  busyIds,
}: PostsListViewProps) {
  const dash = useDashboardPath();
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Posts">
      {items.map((item) => {
        const selected = selection.isSelected(item.id);
        const when = rowWhen(item);
        const failedPub = item.publications.find((p) => p.status === "failed");
        const account = failedPub?.connectedAccountId
          ? healthById.get(failedPub.connectedAccountId)
          : undefined;
        const problem = failedPub
          ? deliveryProblem(failedPub, { accountHealthy: account?.health === "healthy" })
          : null;
        const href = detailHref(item);
        // Your own drafts open straight in the editor, like the table.
        const openHref =
          item.uiStatus === "draft" && !item.isAgentDraft && !readOnly ? editHref(dash, item) : href;
        return (
          <li
            key={item.id}
            data-post-row={item.id}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-xl border bg-bg-elevated transition-[border-color,box-shadow]",
              selected
                ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]"
                : "border-border hover:border-text-subtle",
            )}
          >
            {!readOnly ? (
              <span
                className={cn(
                  "absolute left-2.5 top-2.5 z-10 flex size-7 items-center justify-center rounded-md bg-bg-elevated/90 shadow-sm ring-1 ring-border transition-opacity",
                  selected || selection.count > 0
                    ? "opacity-100"
                    : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                )}
              >
                <SelectCheckbox
                  checked={selected}
                  onToggle={({ range }) => selection.toggle(item.id, { range })}
                  label={`Select “${item.title}”`}
                />
              </span>
            ) : null}
            <Link
              href={openHref}
              state={openHref === href ? navState : undefined}
              className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
            >
              {item.firstMedia ? (
                <div className="flex h-36 items-center justify-center overflow-hidden bg-bg-muted">
                  <PostThumb
                    media={item.firstMedia}
                    extraCount={Math.max(0, item.mediaIds.length - 1)}
                    size={144}
                    className="h-full w-full rounded-none ring-0"
                  />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col gap-2 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <RowPill item={item} />
                  <span className="truncate text-xs text-text-muted" title={when.date ? `${when.label} ${formatFull(when.date, timeOpts)}` : undefined}>
                    {when.date ? queuePrefixed(item, formatWhen(when.date, timeOpts)) : null}
                  </span>
                </div>
                <p
                  className={cn(
                    "line-clamp-2 text-sm leading-snug",
                    item.hasCaption ? "font-medium text-text" : "italic text-text-muted",
                  )}
                >
                  {item.title}
                </p>
                <div className="flex items-center gap-2">
                  <NetworkStack items={rowNetworkItems(item)} max={5} />
                  <span className="truncate text-xs text-text-muted">{rowSubline(item)}</span>
                </div>
                {problem ? (
                  <p className="flex items-start gap-1.5 text-xs text-danger">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="line-clamp-2">{problem.headline}</span>
                  </p>
                ) : null}
              </div>
            </Link>
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <SourceChipView source={item.source} className="max-w-[55%]" />
              <PostRowActions
                item={item}
                detailHref={href}
                navState={navState}
                healthById={healthById}
                canManageConnections={canManageConnections}
                readOnly={readOnly}
                handlers={handlers}
                busy={busyIds.has(item.id)}
                compact
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

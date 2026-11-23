import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  NetworkStack,
  isSelfSource,
  SelectCheckbox,
  SourceChipView,
  StatusPill,
  type AccountWithHealth,
  type RowSelection,
} from "@/components/app";
import { cn } from "@/lib/utils";
import { PostRowActions, type RowHandlers } from "./PostRowActions";
import { PostThumb } from "./PostThumb";
import type { PostNavState } from "./post-nav";
import {
  formatFull,
  formatWhen,
  queuePrefixed,
  rowNetworkItems,
  rowSubline,
  rowWhen,
  type PostListItem,
  type TimeOpts,
} from "./posts-model";

export type PostsListViewProps = {
  items: PostListItem[];
  selection: RowSelection;
  readOnly: boolean;
  timeOpts: TimeOpts;
  navState: PostNavState;
  detailHref: (item: PostListItem) => string;
  onOpen: (item: PostListItem) => void;
  healthById: Map<string, AccountWithHealth>;
  canManageConnections: boolean;
  handlers: RowHandlers;
  busyIds: Set<string>;
};

/**
 * The pill a row shows. Queued posts stay "Scheduled" (SPEC §2 status names);
 * the time cell says they came from the queue.
 */
export function RowPill({ item }: { item: PostListItem }) {
  return <StatusPill status={item.pill} />;
}

/**
 * Dense Posts table (mock 05·A): select, thumbnail, first line + summary,
 * status, per-network delivery dots, source, time, and one state-dependent
 * action with a ⋯ menu. Columns collapse into the first cell on phones.
 *
 * Quiet by default: the media column only shows when a row on the page has
 * media, Source only when a row came from someone other than you, and row
 * actions appear on hover / focus except on rows that need you.
 */
export function PostsTable({
  items,
  selection,
  readOnly,
  timeOpts,
  navState,
  detailHref,
  onOpen,
  healthById,
  canManageConnections,
  handlers,
  busyIds,
}: PostsListViewProps) {
  const showMedia = items.some((i) => i.firstMedia);
  const showSource = items.some((i) => !isSelfSource(i.source));
  return (
    <DataTable aria-label="Posts">
      <DataTableHeader>
        <tr>
          {!readOnly ? (
            <DataTableHead className="pr-0">
              <SelectCheckbox
                checked={selection.allSelected}
                indeterminate={selection.someSelected}
                onToggle={() => selection.toggleAll()}
                label={selection.allSelected ? "Deselect all posts" : "Select all posts on this page"}
              />
            </DataTableHead>
          ) : null}
          {showMedia ? (
            <DataTableHead className={cn(readOnly ? "" : "pl-2")}>
              <span className="sr-only">Media</span>
            </DataTableHead>
          ) : null}
          <DataTableHead className={cn("w-full", !showMedia && !readOnly && "pl-2")}>Post</DataTableHead>
          <DataTableHead className="hidden md:table-cell">Status</DataTableHead>
          <DataTableHead className="hidden sm:table-cell">Delivery</DataTableHead>
          {showSource ? <DataTableHead className="hidden lg:table-cell">Source</DataTableHead> : null}
          <DataTableHead className="hidden md:table-cell">When</DataTableHead>
          <DataTableHead>
            <span className="sr-only">Actions</span>
          </DataTableHead>
        </tr>
      </DataTableHeader>
      <DataTableBody>
        {items.map((item) => {
          const selected = selection.isSelected(item.id);
          const when = rowWhen(item);
          const whenText = when.date ? formatWhen(when.date, timeOpts) : "—";
          const whenTitle = when.date ? `${when.label} ${formatFull(when.date, timeOpts)}` : undefined;
          return (
            <DataTableRow
              key={item.id}
              data-post-row={item.id}
              selected={selected}
              tone={item.uiStatus === "failed" ? "danger" : "default"}
              onActivate={() => onOpen(item)}
              aria-label={item.title}
            >
              {!readOnly ? (
                <DataTableCell className="pr-0" data-row-stop>
                  <SelectCheckbox
                    checked={selected}
                    onToggle={({ range }) => selection.toggle(item.id, { range })}
                    label={`Select “${item.title}”`}
                  />
                </DataTableCell>
              ) : null}
              {showMedia ? (
                <DataTableCell className={cn("py-2", readOnly ? "" : "pl-2")}>
                  <PostThumb media={item.firstMedia} extraCount={Math.max(0, item.mediaIds.length - 1)} />
                </DataTableCell>
              ) : null}
              <DataTableCell className={cn("w-full max-w-0", !showMedia && !readOnly && "pl-2")}>
                <p
                  className={cn(
                    "truncate text-[13.5px] leading-5",
                    item.hasCaption ? "font-medium text-text" : "italic text-text-muted",
                  )}
                  title={item.title}
                >
                  {item.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-text-muted">{rowSubline(item)}</p>
                {/* Phones: the hidden columns, condensed. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:hidden">
                  <RowPill item={item} />
                  <span className="sm:hidden">
                    <NetworkStack items={rowNetworkItems(item)} size={12} max={4} />
                  </span>
                  <span className="text-xs text-text-muted" title={whenTitle}>
                    {queuePrefixed(item, whenText)}
                  </span>
                </div>
              </DataTableCell>
              <DataTableCell className="hidden whitespace-nowrap md:table-cell"><RowPill item={item} /></DataTableCell>
              <DataTableCell className="hidden whitespace-nowrap sm:table-cell">
                {item.publications.length > 0 ? (
                  <NetworkStack items={rowNetworkItems(item)} max={5} />
                ) : (
                  <span className="text-xs text-text-subtle">No accounts</span>
                )}
              </DataTableCell>
              {showSource ? (
                <DataTableCell className="hidden max-w-[11rem] lg:table-cell">
                  <SourceChipView source={item.source} />
                </DataTableCell>
              ) : null}
              <DataTableCell className="hidden whitespace-nowrap text-xs tabular-nums text-text-muted md:table-cell">
                <span title={whenTitle}>{whenText}</span>
                {item.uiStatus === "scheduled" && item.isQueued ? (
                  <span className="block text-xs text-text-subtle">From queue</span>
                ) : null}
              </DataTableCell>
              <DataTableCell className="whitespace-nowrap pl-1" data-row-stop>
                <PostRowActions
                  item={item}
                  detailHref={detailHref(item)}
                  navState={navState}
                  healthById={healthById}
                  canManageConnections={canManageConnections}
                  readOnly={readOnly}
                  handlers={handlers}
                  busy={busyIds.has(item.id)}
                  reveal
                />
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}

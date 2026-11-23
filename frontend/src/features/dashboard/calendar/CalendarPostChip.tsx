import type { CSSProperties, ReactNode } from "react";
import { AlertCircle, Loader2, PenLine } from "lucide-react";
import Link from "@/components/AppLink";
import { NetworkIcon, NetworkStack, SourceChipView, StatusPill } from "@/components/app";
import { cn } from "@/lib/utils";
import { useCalendar } from "./calendar-context";
import { CHIP_TONE, chipTimeLabel, timeLabel, type CalendarEvent } from "./calendar-model";
import { eventAriaLabel, useEventDrag } from "./use-event-drag";

/**
 * Compact calendar chip: network icon, time, first words, status tone.
 * Drafts are dashed. Scheduled future posts can be dragged.
 */
export function CalendarPostChip({
  event,
  className,
  style,
  showSnippet = true,
}: {
  event: CalendarEvent;
  className?: string;
  style?: CSSProperties;
  showSnippet?: boolean;
}) {
  const { use24, postHref, linkState, pending, dragging } = useCalendar();
  const drag = useEventDrag(event);
  const first = event.networks[0]?.network ?? event.fallbackPlatform;
  const extra = Math.max(0, event.networks.length - 1);
  const isPending = pending.has(event.id);
  const label = eventAriaLabel(event, use24);
  const needsAttention =
    event.pill === "failed" ||
    event.pill === "partly_published" ||
    event.brokenAccountIds.length > 0;

  return (
    <Link
      href={postHref(event.id)}
      state={linkState}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      aria-label={label}
      title={drag.draggable ? `${label}. Drag to move.` : label}
      style={style}
      className={cn(
        "group/chip flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs leading-4 transition-[opacity,filter] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 dark:hover:brightness-110",
        CHIP_TONE[event.pill],
        drag.draggable && "cursor-grab active:cursor-grabbing",
        dragging?.id === event.id && "opacity-40",
        isPending && "opacity-70",
        className,
      )}
    >
      {event.isDraft ? (
        <PenLine className="size-3 shrink-0 text-text-muted" aria-hidden />
      ) : first ? (
        <NetworkIcon network={first} size={12} label="" />
      ) : null}
      {extra > 0 ? (
        <span className="shrink-0 text-[10px] font-medium text-text-muted" aria-hidden>
          +{extra}
        </span>
      ) : null}
      <span className="shrink-0 font-medium tabular-nums">
        {chipTimeLabel(event.wall, use24)}
      </span>
      {showSnippet ? (
        <span className="min-w-0 truncate text-text-muted">
          {event.isDraft ? `Draft · ${event.snippet}` : event.snippet}
        </span>
      ) : null}
      {isPending ? (
        <Loader2
          className="ml-auto size-3 shrink-0 animate-spin text-text-muted motion-reduce:animate-none"
          aria-hidden
        />
      ) : needsAttention ? (
        <AlertCircle
          className={cn(
            "ml-auto size-3 shrink-0",
            event.pill === "failed" ? "text-danger" : "text-warning",
          )}
          aria-hidden
        />
      ) : null}
    </Link>
  );
}

/**
 * Roomier row for the day drawer and List view: time, networks with
 * delivery dots, caption, status, creator. `children` renders under it
 * (fix buttons, move form). Not draggable: it lives in the drawer / list,
 * where "Move to another time" does the same job.
 */
export function CalendarPostCard({
  event,
  children,
  className,
}: {
  event: CalendarEvent;
  children?: ReactNode;
  className?: string;
}) {
  const { use24, postHref, linkState, pending } = useCalendar();
  const isPending = pending.has(event.id);
  return (
    <div
      className={cn(
        "rounded-xl border bg-bg-elevated transition-opacity",
        event.pill === "failed"
          ? "border-danger-border"
          : event.pill === "partly_published"
            ? "border-warning-border"
            : event.isDraft
              ? "border-dashed border-border"
              : "border-border",
        className,
      )}
    >
      <Link
        href={postHref(event.id)}
        state={linkState}
        className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label={eventAriaLabel(event, use24)}
      >
        <span className="w-14 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-text-muted">
          {timeLabel(event.wall, use24)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-medium text-text">
            {event.snippet}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusPill status={event.pill} />
            {event.networks.length > 0 ? (
              <NetworkStack items={event.networks} size={14} />
            ) : null}
            <SourceChipView source={event.source} />
          </span>
        </span>
        {isPending ? (
          <Loader2
            className="mt-0.5 size-4 shrink-0 animate-spin text-text-muted motion-reduce:animate-none"
            aria-label="Moving"
          />
        ) : null}
      </Link>
      {children ? <div className="border-t border-border px-3 py-2.5">{children}</div> : null}
    </div>
  );
}

import type { DragEvent } from "react";
import { PILL_STATUS_LABEL, networkLabel } from "@/components/app";
import { useCalendar } from "./calendar-context";
import { DRAG_MIME, timeLabel, type CalendarEvent } from "./calendar-model";

function networksText(event: CalendarEvent): string {
  const names = event.networks.map((n) => networkLabel(n.network));
  return Array.from(new Set(names)).join(", ");
}

/** Accessible one-line description of a post on the calendar. */
export function eventAriaLabel(event: CalendarEvent, use24: boolean): string {
  return [
    timeLabel(event.wall, use24),
    event.snippet,
    PILL_STATUS_LABEL[event.pill],
    networksText(event),
  ]
    .filter(Boolean)
    .join(", ");
}

/** Drag handlers for a post chip/card; no-ops when the post can't move. */
export function useEventDrag(event: CalendarEvent) {
  const { canMove, setDragging, pending } = useCalendar();
  const draggable = canMove && event.movable && !pending.has(event.id);
  return {
    draggable,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      if (!draggable) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DRAG_MIME, event.id);
      setDragging(event);
    },
    onDragEnd: () => setDragging(null),
  };
}


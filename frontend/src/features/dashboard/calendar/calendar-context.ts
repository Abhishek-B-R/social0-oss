import { createContext, useContext } from "react";
import type { CalendarEvent, OpenQueueSlot } from "./calendar-model";

export type CalendarContextValue = {
  /** Display timezone (IANA). */
  tz: string;
  use24: boolean;
  dateFormat: string | null;
  /** Current time as a wall Date in `tz` (refreshes every minute). */
  nowWall: Date;
  /** Can start a new post (members / admins). */
  canCreate: boolean;
  /** Can move scheduled posts (same role gate as editing). */
  canMove: boolean;
  /** Post being dragged right now (drop targets light up). */
  dragging: CalendarEvent | null;
  setDragging: (event: CalendarEvent | null) => void;
  /** Post ids with a move in flight. */
  pending: ReadonlySet<string>;
  /** Move a post to a wall time in `tz` (optionally linking a queue slot). */
  moveTo: (event: CalendarEvent, wall: Date, queueSlotId?: string | null) => void;
  /** Open the composer prefilled with this wall time. */
  createAt: (wall: Date) => void;
  openDay: (dayKey: string) => void;
  /** Link to a post's detail page. */
  postHref: (postId: string) => string;
  /** Router state so the detail page offers "Back to calendar". */
  linkState: { from: string };
  /** Open queue slots per day key. */
  slotsByDay: Map<string, OpenQueueSlot[]>;
};

export const CalendarContext = createContext<CalendarContextValue | null>(null);

export function useCalendar(): CalendarContextValue {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error("useCalendar must be used inside <CalendarContext.Provider>");
  return ctx;
}

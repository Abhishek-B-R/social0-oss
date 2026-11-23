import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { reschedulePost } from "@/api/posts";
import type { LoadCalendarPageDataResult } from "@/api/dashboard-data";
import { calendarQueryKey } from "./use-calendar-data";

type MoveInput = {
  postId: string;
  /** Where the post is now (for revert and Undo). */
  from: Date;
  to: Date;
  /** Queue slot to link when dropped on a ghost slot. */
  queueSlotId?: string | null;
};

type Options = {
  teamId: string | null;
  /** "Tue 20 Oct, 9:15 AM" for the toast. */
  describe: (at: Date) => string;
  /** Queue slot that matches a time exactly (restores the link on Undo). */
  slotIdAt: (at: Date) => string | null;
};

const MIN_LEAD_MS = 60_000;

/** Query prefixes that render a post's scheduled time or queue slot. */
const RESCHEDULE_AFFECTED_KEYS = [
  ["calendar-page"],
  ["dashboard-home"],
  ["posts-page"],
  ["post-detail"],
  ["command-palette"],
  ["queue-next-slot"],
  ["queue", "next-slot"],
] as const;

/**
 * Drag-to-reschedule: optimistic cache patch, server call via
 * `posts.reschedule`, revert on failure, success toast with Undo.
 */
export function useCalendarReschedule({ teamId, describe, slotIdAt }: Options) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const inFlight = useRef(new Set<string>());

  /** Queue slot the post holds now, when the server says (undefined = unknown). */
  const currentSlot = useCallback(
    (postId: string): string | null | undefined => {
      const data = qc.getQueryData<LoadCalendarPageDataResult>(calendarQueryKey(teamId));
      if (!data || !data.ok) return undefined;
      return data.data.posts.find((p) => p.id === postId)?.queueSlotId;
    },
    [qc, teamId],
  );

  const patch = useCallback(
    (postId: string, at: Date) => {
      qc.setQueryData<LoadCalendarPageDataResult>(calendarQueryKey(teamId), (prev) => {
        if (!prev || !prev.ok) return prev;
        const iso = at.toISOString();
        return {
          ...prev,
          data: {
            ...prev.data,
            posts: prev.data.posts.map((p) =>
              p.id === postId ? { ...p, scheduledAt: iso, displayDate: iso } : p,
            ),
          },
        };
      });
    },
    [qc, teamId],
  );

  const setBusy = useCallback((postId: string, busy: boolean) => {
    if (busy) inFlight.current.add(postId);
    else inFlight.current.delete(postId);
    setPending(new Set(inFlight.current));
  }, []);

  const move = useCallback(
    (first: MoveInput): Promise<boolean> => {
      async function run(input: MoveInput, isUndo: boolean): Promise<boolean> {
        const { postId, from, to } = input;
        if (inFlight.current.has(postId)) return false;
        if (Math.floor(from.getTime() / 60_000) === Math.floor(to.getTime() / 60_000)) {
          return false;
        }
        if (to.getTime() < Date.now() + MIN_LEAD_MS) {
          toast.error("That time has already passed. Pick a later time.");
          return false;
        }

        setBusy(postId, true);
        try {
          // A refetch landing mid-move would paint the old time over the
          // optimistic one; drop it, we invalidate again when done.
          await qc.cancelQueries({ queryKey: calendarQueryKey(teamId) });
          const heldSlot = currentSlot(postId);
          patch(postId, to);
          const res = await reschedulePost(postId, to, {
            queueSlotId: input.queueSlotId ?? null,
          });
          if (!res.success) {
            patch(postId, from);
            toast.error(res.error || "Couldn't move this post. Try again.");
            return false;
          }
          patch(postId, new Date(res.scheduledAt));
          if (isUndo) {
            toast.success(`Moved back to ${describe(new Date(res.scheduledAt))}`);
          } else {
            toast.success(`Moved to ${describe(new Date(res.scheduledAt))}`, {
              action: {
                label: "Undo",
                onClick: () => {
                  void run(
                    {
                      postId,
                      from: new Date(res.scheduledAt),
                      to: from,
                      // Put back the exact queue link it had; older payloads
                      // without the field fall back to matching the time.
                      queueSlotId: heldSlot !== undefined ? heldSlot : slotIdAt(from),
                    },
                    true,
                  );
                },
              },
            });
          }
          return true;
        } catch (e) {
          patch(postId, from);
          toast.error(
            e instanceof Error && e.message
              ? `Couldn't move this post: ${e.message}`
              : "Couldn't move this post. Try again.",
          );
          return false;
        } finally {
          setBusy(postId, false);
          // Home, Posts, post detail, ⌘K and the next-slot pickers show the
          // same post's time (and queue slot), so refresh them too.
          for (const queryKey of RESCHEDULE_AFFECTED_KEYS) {
            void qc.invalidateQueries({ queryKey });
          }
        }
      }
      return run(first, false);
    },
    [patch, setBusy, describe, slotIdAt, currentSlot, qc, teamId],
  );

  return { move, pending };
}

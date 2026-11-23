import { useEffect, useSyncExternalStore } from "react";
import { useTeamId } from "./use-dashboard-path";

/**
 * Inbox "needs reply" count for the nav badges (sidebar row, mobile tab).
 *
 * The inbox is a live platform read with no count endpoint, so the badge
 * shows the last count the Inbox page computed for this workspace in this
 * tab. Until the Inbox has loaded once the count is unknown (null) and the
 * badge stays hidden rather than guessing.
 */
const counts = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function workspaceKey(teamId: string | null): string {
  return teamId ?? "personal";
}

/** Last known needs-reply count for the current workspace, or null. */
export function useInboxNeedsReplyCount(): number | null {
  const key = workspaceKey(useTeamId());
  return useSyncExternalStore(
    subscribe,
    () => counts.get(key) ?? null,
    () => null,
  );
}

/**
 * Inbox page reports its unfiltered needs-reply count. Pass null while the
 * count isn't trustworthy (loading, filtered, a source failed) to leave the
 * last known value in place.
 */
export function useReportInboxNeedsReply(count: number | null): void {
  const key = workspaceKey(useTeamId());
  useEffect(() => {
    if (count == null || counts.get(key) === count) return;
    counts.set(key, count);
    for (const l of listeners) l();
  }, [key, count]);
}

/** "3" / "99+" for a badge. */
export function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

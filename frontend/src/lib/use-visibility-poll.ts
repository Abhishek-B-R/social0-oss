import { useEffect, useRef } from "react";

/** Poll interval while a live page (analytics/inbox) is mounted and tab visible. */
export const PAGE_LIVE_POLL_MS = 60_000;

/** Run `callback` on an interval only while the tab is visible. Stops on unmount. */
export function useVisibilityPoll(
  callback: () => void,
  intervalMs: number,
  enabled: boolean,
) {
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") {
        cbRef.current();
      }
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
}

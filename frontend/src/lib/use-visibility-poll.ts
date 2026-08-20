import { useEffect, useRef } from "react";

/** Run `callback` on an interval only while the tab is visible. */
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

export const INBOX_COMMENTS_POLL_MS = 180_000;
export const INBOX_DMS_POLL_MS = 120_000;

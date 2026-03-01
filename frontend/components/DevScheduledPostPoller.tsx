"use client";

import { useEffect } from "react";

const POLL_INTERVAL_MS = 60000; // 1 minute

/**
 * Development-only component that polls cron endpoints locally.
 * In production, Vercel Cron Jobs handle these.
 *
 * Calls /api/dev/trigger-crons (session-gated proxy) which injects
 * the CRON_SECRET server-side — the secret never touches the browser.
 */
export function DevScheduledPostPoller() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const runCrons = async () => {
      try {
        const res = await fetch("/api/dev/trigger-crons");
        if (!res.ok) {
          console.error("[Dev] trigger-crons failed:", res.status, await res.text());
          return;
        }
        const data = await res.json();

        const { publishScheduled, resurface, autoplug } = data;

        if (publishScheduled?.processed > 0) {
          console.log(
            "[Dev] Published",
            publishScheduled.processed,
            "scheduled post(s)",
            publishScheduled.ids,
          );
          window.location.reload();
          return;
        }
        if (resurface?.processed > 0) {
          console.log("[Dev] Resurface processed", resurface.processed);
          window.location.reload();
          return;
        }
        if ((autoplug?.triggered ?? 0) > 0 || (autoplug?.expired ?? 0) > 0) {
          console.log("[Dev] Autoplug", autoplug);
          window.location.reload();
        }
      } catch (e) {
        console.error("[Dev] Error polling crons:", e);
      }
    };

    runCrons();
    const interval = setInterval(runCrons, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}

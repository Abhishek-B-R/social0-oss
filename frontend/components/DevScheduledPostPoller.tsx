"use client";

import { useEffect } from "react";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Development-only: runs crons in the background when the tab is hidden.
 * In production, Vercel Cron Jobs handle these.
 * No full-page reloads — avoids bad UX on connections and other pages.
 */
export function DevScheduledPostPoller() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "development" ||
      typeof document === "undefined"
    ) {
      return;
    }

    const runCrons = async () => {
      try {
        // const res = await fetch("/api/dev/trigger-crons");
        // if (!res.ok) return;
        // const data = await res.json();
        // const { publishScheduled, resurface, autoplug } = data;
        // if (publishScheduled?.processed > 0) {
        //   console.log("[Dev] Published", publishScheduled.processed, "scheduled post(s)", publishScheduled.ids);
        // }
        // if (resurface?.processed > 0) {
        //   console.log("[Dev] Resurface processed", resurface.processed);
        // }
        // if ((autoplug?.triggered ?? 0) > 0 || (autoplug?.expired ?? 0) > 0) {
        //   console.log("[Dev] Autoplug", autoplug);
        // }
      } catch {
        // ignore
      }
    };

    const intervalRef = {
      current: null as ReturnType<typeof setInterval> | null,
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        runCrons();
        intervalRef.current = setInterval(runCrons, POLL_INTERVAL_MS);
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (document.visibilityState === "hidden") {
      runCrons();
      intervalRef.current = setInterval(runCrons, POLL_INTERVAL_MS);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}

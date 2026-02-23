"use client";

import { useEffect } from "react";

const POLL_INTERVAL_MS = 30000; // 30 seconds

/**
 * Development-only component that polls cron endpoints locally.
 * In production, Vercel Cron Jobs handle these.
 */
export function DevScheduledPostPoller() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const runCrons = async () => {
      // 1. Publish scheduled posts
      try {
        const res = await fetch("/api/cron/publish-scheduled");
        if (res.ok) {
          const data = await res.json();
          if (data.processed > 0) {
            console.log("[Dev] Published", data.processed, "scheduled post(s)", data.ids);
            window.location.reload();
          }
        }
      } catch (e) {
        console.error("[Dev] Error publish-scheduled:", e);
      }

      // 2. Auto-Repost (resurface)
      try {
        const res = await fetch("/api/cron/resurface");
        if (res.ok) {
          const data = await res.json();
          if (data.processed > 0) {
            console.log("[Dev] Resurface processed", data.processed);
            window.location.reload();
          }
        }
      } catch (e) {
        console.error("[Dev] Error resurface:", e);
      }

      // 3. Auto-Plug
      try {
        const res = await fetch("/api/cron/autoplug");
        if (res.ok) {
          const data = await res.json();
          if ((data.checked ?? 0) > 0 || (data.triggered ?? 0) > 0 || (data.expired ?? 0) > 0) {
            console.log("[Dev] Autoplug", data);
            if ((data.triggered ?? 0) > 0 || (data.expired ?? 0) > 0) window.location.reload();
          }
        }
      } catch (e) {
        console.error("[Dev] Error autoplug:", e);
      }
    };

    runCrons();
    const interval = setInterval(runCrons, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}

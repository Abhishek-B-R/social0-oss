"use client";

import { useEffect } from "react";

/**
 * Development-only component that polls for scheduled posts
 * In production, Vercel Cron Jobs handle this
 */
export function DevScheduledPostPoller() {
  useEffect(() => {
    // Only run in development
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const checkScheduledPosts = async () => {
      try {
        // In development, no auth needed
        const response = await fetch("/api/cron/publish-scheduled");

        if (response.ok) {
          const data = await response.json();
          if (data.processed > 0) {
            console.log(`[Dev] Published ${data.processed} scheduled post(s)`, data.ids);
            // Refresh the page to show updated post status
            window.location.reload();
          }
        }
      } catch (error) {
        console.error("[Dev] Error checking scheduled posts:", error);
      }
    };

    // Check immediately, then every 30 seconds
    checkScheduledPosts();
    const interval = setInterval(checkScheduledPosts, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  return null;
}

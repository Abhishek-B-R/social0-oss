"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "queueSuccess";

export function QueueSuccessBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { message?: string };
      if (data.message) {
        setMessage(data.message);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
    >
      {message}
    </div>
  );
}

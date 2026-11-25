import { useEffect, useRef } from "react";
import { loadToolDraft, saveToolDraft } from "@/lib/tool-handoff";

/**
 * Remember a free tool's work across sign-in and reloads (IndexedDB, 7 days).
 * `value` must be structured-cloneable (plain data and File/Blob, no elements).
 * Pass `null` to save nothing (e.g. still showing the sample).
 */
export function useToolDraft<T>(tool: string, value: T | null, restore: (saved: T) => void) {
  const restoreRef = useRef(restore);
  const ready = useRef(false);
  useEffect(() => {
    restoreRef.current = restore;
  });
  useEffect(() => {
    let live = true;
    void loadToolDraft<T>(tool).then((saved) => {
      if (live && saved) restoreRef.current(saved);
      ready.current = true;
    });
    return () => {
      live = false;
    };
  }, [tool]);
  useEffect(() => {
    if (!ready.current || value === null) return;
    const t = window.setTimeout(() => void saveToolDraft(tool, value), 400);
    return () => window.clearTimeout(t);
  }, [tool, value]);
}

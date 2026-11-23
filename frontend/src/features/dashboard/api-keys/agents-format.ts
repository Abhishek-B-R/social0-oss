import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { WEBHOOK_EVENT_OPTIONS } from "./agents-api";

/* Formatting + clipboard helpers for the AI agents page. */

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Full timestamp for tooltips / detail panes. */
export function fullTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, "MMM d, yyyy 'at' h:mm:ss a") : "—";
}

export function shortDate(iso: string | null | undefined, fallback = "—"): string {
  const d = toDate(iso);
  return d ? format(d, "MMM d, yyyy") : fallback;
}

export function latestIso(...values: (string | null | undefined)[]): string | null {
  let best: Date | null = null;
  for (const v of values) {
    const d = toDate(v);
    if (d && (!best || d > best)) best = d;
  }
  return best ? best.toISOString() : null;
}

/** "sk_live_AbCd" → "sk_live_AbCd••••••••". Never the full key. */
export function maskedKey(prefix: string): string {
  return `${prefix}${"•".repeat(8)}`;
}

// ── Copy ────────────────────────────────────────────────────────────────────

export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  const copy = useCallback(async (text: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      toast.success(label);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }, []);
  return { copy, copied };
}

const EVENT_LABEL: Record<string, string> = {
  ...Object.fromEntries(WEBHOOK_EVENT_OPTIONS.map((e) => [e.value, e.label])),
  "webhook.test": "Test",
};

/** "post.published" → "Post published"; unknown events pass through. */
export function eventLabel(event: string): string {
  return EVENT_LABEL[event] ?? event;
}


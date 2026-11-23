import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SaveStatusContext,
  useSaveStatus,
  type SaveStatus,
  type SaveStatusApi,
} from "./save-status-context";

/** How long "Saved" stays visible after the last successful save. */
const SAVED_VISIBLE_MS = 4000;

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [inFlight, setInFlight] = useState(0);
  const [result, setResult] = useState<"idle" | "saved" | "error">("idle");
  const hideTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const track = useCallback(async <T,>(work: Promise<T>): Promise<T> => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setInFlight((n) => n + 1);
    try {
      const value = await work;
      setResult("saved");
      hideTimer.current = window.setTimeout(() => {
        setResult((r) => (r === "saved" ? "idle" : r));
        hideTimer.current = null;
      }, SAVED_VISIBLE_MS);
      return value;
    } catch (err) {
      setResult("error");
      throw err;
    } finally {
      setInFlight((n) => Math.max(0, n - 1));
    }
  }, []);

  const status: SaveStatus = inFlight > 0 ? "saving" : result;
  const api = useMemo<SaveStatusApi>(() => ({ status, track }), [status, track]);

  return <SaveStatusContext.Provider value={api}>{children}</SaveStatusContext.Provider>;
}

/** "Saving…" / "Saved" / "Not saved" for the surrounding section. */
export function SaveIndicator({ className }: { className?: string }) {
  const { status } = useSaveStatus();
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex h-7 min-w-[5.5rem] items-center justify-end gap-1.5 text-xs font-medium",
        status === "saving" && "text-text-muted",
        status === "saved" && "text-ok",
        status === "error" && "text-danger",
        className,
      )}
    >
      {status === "saving" ? (
        <>
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          Saving…
        </>
      ) : status === "saved" ? (
        <>
          <Check className="size-3.5" aria-hidden />
          Saved
        </>
      ) : status === "error" ? (
        <>
          <AlertCircle className="size-3.5" aria-hidden />
          Not saved
        </>
      ) : null}
    </span>
  );
}

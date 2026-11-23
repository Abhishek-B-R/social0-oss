import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSaveStatus } from "./save-status-context";

/** Save functions may resolve `{ error }` instead of throwing (settings RPCs do). */
type SaveResult = void | undefined | { error?: string | null } | unknown;

type AutosaveOptions<T> = {
  /** Current server value. The field follows it while the user isn't editing. */
  value: T;
  save: (next: T) => Promise<SaveResult>;
  /** Debounce for `set(v)` (typing). Toggles/selects pass `{ immediate: true }`. */
  delay?: number;
  isEqual?: (a: T, b: T) => boolean;
  /** Return a message to block the save (shown inline by the caller). */
  validate?: (next: T) => string | null;
  /** Called after a confirmed save, e.g. to patch a query cache. */
  onSaved?: (next: T) => void;
  /** What failed, in plain words: "Couldn't save your timezone". */
  errorMessage: string;
};

export type Autosave<T> = {
  value: T;
  set: (next: T, opts?: { immediate?: boolean }) => void;
  /** Save now (on blur / Enter). Invalid drafts revert to the saved value. */
  flush: () => void;
  /** Validation message for the current draft, if any. */
  error: string | null;
  dirty: boolean;
};

function resultError(result: SaveResult): string | null {
  if (result && typeof result === "object" && "error" in result) {
    const e = (result as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return null;
}

/**
 * Autosave one field: optimistic local value, debounced or immediate save,
 * saves run one after another (no out-of-order writes), and on failure the
 * field goes back to the last saved value with an error toast.
 */
export function useAutosave<T>(options: AutosaveOptions<T>): Autosave<T> {
  const { track } = useSaveStatus();
  const { value } = options;
  const isEqual = options.isEqual ?? Object.is;

  const [draft, setDraft] = useState<T>(value);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the server value while the user isn't mid-edit.
  const [synced, setSynced] = useState<T>(value);
  if (!isEqual(synced, value)) {
    setSynced(value);
    if (!dirty) setDraft(value);
  }

  const optsRef = useRef(options);
  useLayoutEffect(() => {
    optsRef.current = options;
  });

  const savedRef = useRef<T>(value);
  useEffect(() => {
    if (!dirty) savedRef.current = value;
  }, [value, dirty]);

  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ v: T } | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const seqRef = useRef(0);
  /** The last committed draft failed validation (e.g. an empty name). */
  const invalidRef = useRef(false);

  const commit = useCallback(
    (next: T) => {
      const opts = optsRef.current;
      const eq = opts.isEqual ?? Object.is;
      const invalid = opts.validate?.(next) ?? null;
      setError(invalid);
      invalidRef.current = !!invalid;
      if (invalid) return;
      const seq = ++seqRef.current;
      chainRef.current = chainRef.current.then(async () => {
        if (eq(next, savedRef.current)) {
          if (seq === seqRef.current) setDirty(false);
          return;
        }
        try {
          await track(
            opts.save(next).then((result) => {
              const msg = resultError(result);
              if (msg) throw new Error(msg);
            }),
          );
          savedRef.current = next;
          optsRef.current.onSaved?.(next);
        } catch (err) {
          const detail = err instanceof Error && err.message ? err.message : null;
          toast.error(`${opts.errorMessage}. Your change was undone.`, {
            description: detail ?? "Check your connection and try again.",
          });
          if (seq === seqRef.current) setDraft(savedRef.current);
        } finally {
          if (seq === seqRef.current) setDirty(false);
        }
      });
    },
    [track],
  );

  const set = useCallback(
    (next: T, opts?: { immediate?: boolean }) => {
      setDraft(next);
      setDirty(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      if (opts?.immediate) {
        pendingRef.current = null;
        commit(next);
        return;
      }
      // Validate as they type so the message shows early, but don't save yet.
      setError(optsRef.current.validate?.(next) ?? null);
      pendingRef.current = { v: next };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) commit(pending.v);
      }, optsRef.current.delay ?? 700);
    },
    [commit],
  );

  const flush = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    const opts = optsRef.current;
    const invalid = pending ? !!opts.validate?.(pending.v) : invalidRef.current;
    if (invalid) {
      // Leaving an invalid field: put the saved value back.
      invalidRef.current = false;
      setDraft(savedRef.current);
      setError(null);
      setDirty(false);
      return;
    }
    if (pending) commit(pending.v);
  }, [commit]);

  // Don't lose a debounced edit when the section unmounts.
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending && !optsRef.current.validate?.(pending.v)) {
        void optsRef.current.save(pending.v).catch(() => undefined);
      }
    },
    [],
  );

  return { value: draft, set, flush, error, dirty };
}

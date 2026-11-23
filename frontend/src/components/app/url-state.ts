import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

type SetOptions = {
  /** Push a history entry instead of replacing (default: replace). */
  push?: boolean;
  /** Other params to clear in the same update (e.g. reset `page`). */
  reset?: string[];
};

/**
 * One search param as state. Setting the default value (or null/"")
 * removes it from the URL so links stay clean.
 *
 *   const [tab, setTab] = useSearchParamState("tab", "all");
 */
export function useSearchParamState<T extends string = string>(
  key: string,
  defaultValue: T,
): [T, (next: T | null, opts?: SetOptions) => void] {
  const [params, setParams] = useSearchParams();
  const value = (params.get(key) as T | null) ?? defaultValue;
  const set = useCallback(
    (next: T | null, opts?: SetOptions) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next == null || next === "" || next === defaultValue) p.delete(key);
          else p.set(key, next);
          for (const r of opts?.reset ?? []) p.delete(r);
          return p;
        },
        { replace: !opts?.push },
      );
    },
    [key, defaultValue, setParams],
  );
  return [value, set];
}

/**
 * Comma-separated multi-value param (`?network=instagram,tiktok`).
 * Empty list removes the param.
 */
export function useSearchParamList(
  key: string,
): [string[], (next: string[], opts?: SetOptions) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = useMemo(
    () => (raw ? raw.split(",").filter(Boolean) : []),
    [raw],
  );
  const set = useCallback(
    (next: string[], opts?: SetOptions) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.length === 0) p.delete(key);
          else p.set(key, next.join(","));
          for (const r of opts?.reset ?? []) p.delete(r);
          return p;
        },
        { replace: !opts?.push },
      );
    },
    [key, setParams],
  );
  return [value, set];
}

import { useCallback, useMemo, useRef, useState } from "react";

export type RowSelection = {
  /** Selected ids that are still present in `ids`. */
  selectedIds: string[];
  count: number;
  isSelected: (id: string) => boolean;
  /** Toggle one row. Pass `{ range: true }` (shift-click) to select from the last anchor. */
  toggle: (id: string, opts?: { range?: boolean }) => void;
  toggleAll: () => void;
  clear: () => void;
  allSelected: boolean;
  someSelected: boolean;
};

/**
 * Checkbox selection for a list of row ids (DataTable + FloatingBulkBar).
 * Rows that leave `ids` (tab, page or filter change, deleted rows) are
 * dropped from the selection, so coming back never silently re-selects them.
 */
export function useRowSelection(ids: string[]): RowSelection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  // Prune during render when the visible rows change (keyed by content, so
  // an unmemoized `ids` array can't loop).
  const idsKey = ids.join("\u0000");
  const [prevIdsKey, setPrevIdsKey] = useState(idsKey);
  if (prevIdsKey !== idsKey) {
    setPrevIdsKey(idsKey);
    const visible = new Set(ids);
    const kept = [...selected].filter((id) => visible.has(id));
    if (kept.length !== selected.size) setSelected(new Set(kept));
  }

  const selectedIds = useMemo(
    () => ids.filter((id) => selected.has(id)),
    [ids, selected],
  );
  const count = selectedIds.length;
  const allSelected = ids.length > 0 && count === ids.length;

  const toggle = useCallback(
    (id: string, opts?: { range?: boolean }) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const from = anchor.current;
        if (opts?.range && from && from !== id) {
          const a = ids.indexOf(from);
          const b = ids.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            const on = !prev.has(id);
            for (const rid of ids.slice(lo, hi + 1)) {
              if (on) next.add(rid);
              else next.delete(rid);
            }
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
    },
    [ids],
  );

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const everyOn = ids.length > 0 && ids.every((id) => prev.has(id));
      return everyOn ? new Set() : new Set(ids);
    });
  }, [ids]);

  const clear = useCallback(() => setSelected(new Set()), []);
  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return {
    selectedIds,
    count,
    isSelected,
    toggle,
    toggleAll,
    clear,
    allSelected,
    someSelected: count > 0 && !allSelected,
  };
}

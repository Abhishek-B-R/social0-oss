import { useCallback, useRef, type KeyboardEvent } from "react";

/**
 * Roving focus for a radiogroup of ChoiceCards: arrow keys move and select,
 * only the selected (or first) card is in the tab order.
 */
export function useRadioGroupKeys<T extends string>(
  ids: readonly T[],
  value: T | null,
  onChange: (id: T) => void,
) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const focusable = value ?? ids[0];

  const register = useCallback(
    (id: T) => (node: HTMLButtonElement | null) => {
      if (node) refs.current.set(id, node);
      else refs.current.delete(id);
    },
    [],
  );

  const onKeyDown = useCallback(
    (id: T) => (e: KeyboardEvent<HTMLButtonElement>) => {
      const delta =
        e.key === "ArrowDown" || e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowUp" || e.key === "ArrowLeft"
            ? -1
            : 0;
      if (!delta) return;
      e.preventDefault();
      const i = ids.indexOf(id);
      const next = ids[(i + delta + ids.length) % ids.length];
      onChange(next);
      refs.current.get(next)?.focus();
    },
    [ids, onChange],
  );

  return {
    itemProps: (id: T) => ({
      tabIndex: id === focusable ? 0 : -1,
      onKeyDown: onKeyDown(id),
      cardRef: register(id),
    }),
  };
}

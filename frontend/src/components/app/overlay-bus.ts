import { useSyncExternalStore } from "react";

/** Global open state for the ⌘K palette and the `?` shortcut sheet. */
type OverlayState = {
  palette: boolean;
  /** Text to prefill the palette with when it opens. */
  paletteQuery: string;
  shortcuts: boolean;
};

let state: OverlayState = { palette: false, paletteQuery: "", shortcuts: false };
const listeners = new Set<() => void>();

function set(next: Partial<OverlayState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function openCommandPalette(query = ""): void {
  set({ palette: true, paletteQuery: query, shortcuts: false });
}
export function closeCommandPalette(): void {
  set({ palette: false });
}
export function toggleCommandPalette(): void {
  set({ palette: !state.palette, paletteQuery: "", shortcuts: false });
}
export function openShortcutSheet(): void {
  set({ shortcuts: true, palette: false });
}
export function closeShortcutSheet(): void {
  set({ shortcuts: false });
}

export function useOverlayState(): OverlayState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => state,
    () => state,
  );
}

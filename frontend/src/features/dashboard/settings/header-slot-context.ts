import { createContext } from "react";

/**
 * Where a settings section's primary action goes: next to the page title
 * (the one filled button per view), not in a toolbar of its own.
 *
 * `null` = not inside the settings shell (render in place).
 * `{ slot: null }` = inside the shell, header not mounted yet (render nothing).
 */
export const SettingsHeaderSlotContext = createContext<{ slot: HTMLElement | null } | null>(null);

/**
 * Shortcut syntax shared by useHotkeys, Kbd and the ShortcutSheet:
 *   "c"        single key (no modifiers)
 *   "?"        punctuation (shift ignored)
 *   "g h"      sequence: g, then h within 1s
 *   "mod+k"    ⌘ on macOS, Ctrl elsewhere
 *   "mod+enter", "shift+r", "alt+n", "esc"
 */

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  const platform = uaData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const KEY_GLYPH: Record<string, string> = {
  enter: "↵",
  return: "↵",
  esc: "Esc",
  escape: "Esc",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  space: "Space",
  backspace: "⌫",
  tab: "Tab",
};

/** Display parts for a shortcut string, e.g. "mod+k" → ["⌘", "K"]. */
export function formatShortcut(keys: string): string[] {
  const mac = isMacPlatform();
  const out: string[] = [];
  for (const step of keys.trim().split(/\s+/)) {
    for (const part of step.split("+")) {
      const p = part.toLowerCase();
      if (p === "mod") out.push(mac ? "⌘" : "Ctrl");
      else if (p === "shift") out.push(mac ? "⇧" : "Shift");
      else if (p === "alt") out.push(mac ? "⌥" : "Alt");
      else if (p === "ctrl") out.push(mac ? "⌃" : "Ctrl");
      else out.push(KEY_GLYPH[p] ?? (p.length === 1 ? p.toUpperCase() : part));
    }
  }
  return out;
}

/** Plain-text label, e.g. "⌘K", "G then H". For titles/tooltips. */
export function shortcutLabel(keys: string): string {
  const steps = keys.trim().split(/\s+/);
  return steps.map((s) => formatShortcut(s).join("")).join(" then ");
}

export type ShortcutDef = {
  keys: string;
  description: string;
  /** Group heading in the shortcut sheet. */
  group: "General" | "Go to" | "New post" | "Lists" | "Calendar" | "Inbox";
};

/**
 * Every shortcut the dashboard binds, for the `?` sheet. Page-level
 * shortcuts (composer, inbox, lists, calendar) are listed here so the sheet
 * stays complete; the pages bind them with `useHotkeys`.
 */
export const DASHBOARD_SHORTCUTS: ShortcutDef[] = [
  { keys: "mod+k", description: "Open command palette", group: "General" },
  { keys: "c", description: "New post", group: "General" },
  { keys: "?", description: "Show keyboard shortcuts", group: "General" },
  { keys: "esc", description: "Close dialog or drawer", group: "General" },
  { keys: "g h", description: "Go to Home", group: "Go to" },
  { keys: "g i", description: "Go to Inbox", group: "Go to" },
  { keys: "g c", description: "Go to Calendar", group: "Go to" },
  { keys: "g p", description: "Go to Posts", group: "Go to" },
  { keys: "g a", description: "Go to Analytics", group: "Go to" },
  {
    keys: "mod+enter",
    description: "Add to queue / schedule / publish",
    group: "New post",
  },
  { keys: "mod+shift+enter", description: "Publish now", group: "New post" },
  { keys: "/", description: "Search posts", group: "Lists" },
  { keys: "j", description: "Next item (next post on post detail)", group: "Lists" },
  { keys: "k", description: "Previous item (previous post on post detail)", group: "Lists" },
  { keys: "x", description: "Select row", group: "Lists" },
  { keys: "arrowleft", description: "Previous post (post detail)", group: "Lists" },
  { keys: "arrowright", description: "Next post (post detail)", group: "Lists" },
  { keys: "t", description: "Go to today", group: "Calendar" },
  { keys: "n", description: "Next week or month", group: "Calendar" },
  { keys: "p", description: "Previous week or month", group: "Calendar" },
  { keys: "m", description: "Month view", group: "Calendar" },
  { keys: "w", description: "Week view", group: "Calendar" },
  { keys: "l", description: "List view", group: "Calendar" },
  { keys: "r", description: "Reply to the open comment or DM", group: "Inbox" },
  { keys: "e", description: "Mark done / move back to Needs reply", group: "Inbox" },
];

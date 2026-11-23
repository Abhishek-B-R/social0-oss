import type { ComposerDraft, ComposerMedia } from "./types";

/**
 * Autosave for posts that don't exist on the server yet.
 *
 * - In memory (this tab): the whole draft, files included, so closing and
 *   reopening the composer, or expanding the modal to the full page, loses
 *   nothing.
 * - localStorage: text, accounts and settings (files can't be stored), so a
 *   reload or a closed tab still brings the words back.
 *
 * Keyed by workspace so a team post never shows up in the personal one.
 */

type Saved = { draft: ComposerDraft; savedAt: number };

const memory = new Map<string, Saved>();
const PREFIX = "social0-composer-autosave:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function storageKey(scope: string): string {
  return `${PREFIX}${scope}`;
}

function stripFiles(draft: ComposerDraft): ComposerDraft {
  const keep = (m: ComposerMedia) => !!m.existingId;
  return {
    ...draft,
    parts: draft.parts.map((p) => ({
      ...p,
      media: p.media.filter(keep).map((m) => ({ ...m, file: undefined })),
    })),
  };
}

export function hasContent(draft: ComposerDraft): boolean {
  return draft.parts.some((p) => p.text.trim() || p.media.length > 0);
}

export function saveLocalDraft(scope: string, draft: ComposerDraft): void {
  if (!hasContent(draft)) {
    clearLocalDraft(scope);
    return;
  }
  const savedAt = Date.now();
  memory.set(scope, { draft, savedAt });
  try {
    localStorage.setItem(
      storageKey(scope),
      JSON.stringify({ draft: stripFiles(draft), savedAt }),
    );
  } catch {
    // private mode / quota: the in-memory copy still works this session
  }
}

/** Most recent unsent draft for this workspace, if any. */
export function loadLocalDraft(scope: string): Saved | null {
  const mem = memory.get(scope);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > MAX_AGE_MS ||
      !parsed.draft ||
      !Array.isArray(parsed.draft.parts)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Second slot for a new post written while an older unsent one is kept in
 * the main slot (a prefilled composer, or a hand-off, met an earlier post the
 * person hasn't opened or discarded yet). Keeps the new post from being
 * lost on close without overwriting the older one.
 */
export function newerScope(scope: string): string {
  return `${scope}:newer`;
}

export function clearLocalDraft(scope: string): void {
  memory.delete(scope);
  try {
    localStorage.removeItem(storageKey(scope));
  } catch {
    // ignore
  }
}

// ---- hand-off between composer instances ------------------------------------
// "Open full page" from the modal, and "Reopen" from a failed tray job, pass a
// complete draft (files included) to the next composer that mounts.

/**
 * Where the sending composer kept its post, so the receiving one goes on
 * saving to the same slot. Absent (a reopened post: it was sent, so it is
 * not saved anywhere) means the receiver works it out from what is saved.
 */
export type HandOffSlots = {
  /** An older unsent post sits in the main slot and must stay there. */
  keepsOlder: boolean;
  /** The post is saved in the `newerScope` slot. */
  ownsNewer: boolean;
};

export type PendingRestore = { draft: ComposerDraft; slots: HandOffSlots | null };

let pendingRestore: PendingRestore | null = null;
let restoreVersion = 0;

export function setPendingRestore(draft: ComposerDraft, slots?: HandOffSlots): void {
  pendingRestore = { draft, slots: slots ?? null };
  restoreVersion += 1;
}

/** Bumps on every hand-off; part of the page composer's key. */
export function pendingRestoreVersion(): number {
  return restoreVersion;
}

/** Non-destructive read (safe in StrictMode's double initializers). */
export function getPendingRestore(): PendingRestore | null {
  return pendingRestore;
}

/** Clear after the receiving composer has mounted. */
export function clearPendingRestore(draft?: ComposerDraft | null): void {
  if (!draft || pendingRestore?.draft === draft) pendingRestore = null;
}

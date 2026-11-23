import { useSyncExternalStore } from "react";

/** What to prefill when opening the composer from anywhere. */
export type ComposerOpenOptions = {
  /** Caption text (palette "Create post with this text", Home quick-compose). */
  text?: string;
  /** ISO string or Date: preselect this time (calendar empty slot, "New post at 14:00"). */
  scheduledAt?: string | Date;
  /**
   * Queue slot that `scheduledAt` came from (Home "Add to queue · <slot>"),
   * so the post books that slot instead of a plain scheduled time.
   */
  queueSlotId?: string;
  /** Connected account ids to preselect. */
  accounts?: string[];
  /**
   * "schedule" opens the schedule popover right away (palette "Schedule post").
   * "now" makes "Publish now" the primary action even when a posting queue
   * exists (Home quick-compose "Publish now…"); picking a time or "Add to
   * queue" in the composer still switches it.
   */
  intent?: "schedule" | "now";
  /**
   * Media to attach on open (Home quick-compose drop / paste). Goes through
   * the composer's normal file checks. Modal only: files can't ride in the
   * `/new` query string, so `composerSearchParams` leaves them out.
   */
  files?: File[];
};

export type ComposerState = {
  open: boolean;
  options: ComposerOpenOptions;
  /** Increments on every openComposer call, so repeated opens are observable. */
  nonce: number;
};

let state: ComposerState = { open: false, options: {}, nonce: 0 };
const listeners = new Set<() => void>();
/** Full-page composers currently mounted (`/new` and its old aliases). */
let pageComposers = 0;

function emit(next: ComposerState) {
  state = next;
  for (const l of listeners) l();
}

/**
 * Open the composer modal from any dashboard component.
 *
 * No-op while a composer is already up (the modal, or the full-page one):
 * both edit the same autosaved draft, so a second editor would race the
 * first one's autosave, and re-opening would remount the modal and swap the
 * draft in progress for the new prefill.
 */
export function openComposer(options: ComposerOpenOptions = {}): void {
  if (state.open || pageComposers > 0) return;
  emit({ open: true, options, nonce: state.nonce + 1 });
}

/**
 * The full-page composer calls this while mounted so `openComposer()`
 * doesn't stack a modal over it. Returns the unregister function.
 */
export function registerPageComposer(): () => void {
  pageComposers += 1;
  for (const l of listeners) l();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    pageComposers -= 1;
    for (const l of listeners) l();
  };
}

/** Full-page composer routes (dashboard-relative): `new`, `composer`, `create/*`. */
export function isComposerPagePath(relativePath: string): boolean {
  const segment = relativePath.split("/")[0];
  return segment === "new" || segment === "composer" || segment === "create";
}

export function closeComposer(): void {
  if (!state.open) return;
  emit({ ...state, open: false });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Current composer modal state (used by ComposerHost). */
export function useComposerState(): ComposerState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/**
 * True while a composer is up (modal open or full-page mounted), i.e. while
 * `openComposer()` would do nothing. Lets entry points hide themselves.
 */
export function useComposerActive(): boolean {
  const active = () => state.open || pageComposers > 0;
  return useSyncExternalStore(subscribe, active, active);
}

/**
 * Query string for the full-page composer (`/new`) carrying the same
 * prefill: `?text=…&at=<iso>&accounts=a,b&intent=schedule`.
 */
export function composerSearchParams(options: ComposerOpenOptions): string {
  const p = new URLSearchParams();
  if (options.text) p.set("text", options.text);
  if (options.scheduledAt) {
    const d =
      options.scheduledAt instanceof Date
        ? options.scheduledAt
        : new Date(options.scheduledAt);
    if (!Number.isNaN(d.getTime())) p.set("at", d.toISOString());
  }
  if (options.queueSlotId && options.scheduledAt) p.set("slot", options.queueSlotId);
  if (options.accounts?.length) p.set("accounts", options.accounts.join(","));
  if (options.intent) p.set("intent", options.intent);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Inverse of `composerSearchParams`, for the `/new` page. */
export function readComposerSearchParams(
  params: URLSearchParams,
): ComposerOpenOptions {
  const accounts = params.get("accounts");
  const intent = params.get("intent");
  return {
    text: params.get("text") ?? undefined,
    scheduledAt: params.get("at") ?? undefined,
    queueSlotId: params.get("slot") ?? undefined,
    accounts: accounts ? accounts.split(",").filter(Boolean) : undefined,
    intent: intent === "schedule" || intent === "now" ? intent : undefined,
  };
}

/** Props the lazily loaded `ComposerModal` receives from `ComposerHost`. */
export type ComposerModalProps = {
  open: boolean;
  options: ComposerOpenOptions;
  /** Changes on every `openComposer` call; reset local state when it changes. */
  nonce: number;
  onClose: () => void;
};

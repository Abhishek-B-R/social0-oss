/**
 * Per-user inbox state kept in this browser:
 * - "handled": items you replied to or marked done (key → activity time).
 *   Newer activity on the item puts it back in Needs reply.
 * - hidden posts: publications you hid from Needs reply (shared with the
 *   old inbox via `@/lib/inbox-hidden-posts`).
 *
 * There is no server table for this, so it is per device by design.
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  hideInboxPublication,
  loadHiddenInboxPublications,
  subscribeHiddenInboxPublications,
  unhideInboxPublication,
} from "@/lib/inbox-hidden-posts";

const HANDLED_PREFIX = "s0:inbox:handled";
const HANDLED_EVENT = "s0-inbox-handled";
const HANDLED_MAX = 1000;

type HandledMap = Record<string, string>;

const EMPTY_MAP: HandledMap = Object.freeze({}) as HandledMap;
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

function handledKey(userId: string): string {
  return `${HANDLED_PREFIX}:${userId}`;
}

function readHandled(userId: string): HandledMap {
  try {
    const raw = localStorage.getItem(handledKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: HandledMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeHandled(userId: string, map: HandledMap): void {
  try {
    let entries = Object.entries(map);
    if (entries.length > HANDLED_MAX) {
      // Keep the most recent activity; old items are long out of range.
      entries = entries
        .sort((a, b) => b[1].localeCompare(a[1]))
        .slice(0, HANDLED_MAX);
    }
    localStorage.setItem(handledKey(userId), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage blocked or full: state lives for this tab only */
  }
  handledCache.set(userId, Object.fromEntries(Object.entries(map)));
  window.dispatchEvent(new Event(HANDLED_EVENT));
}

const handledCache = new Map<string, HandledMap>();

function handledSnapshot(userId: string | undefined | null): HandledMap {
  if (!userId) return EMPTY_MAP;
  let cached = handledCache.get(userId);
  if (!cached) {
    cached = readHandled(userId);
    handledCache.set(userId, cached);
  }
  return cached;
}

function subscribeHandled(userId: string | undefined | null, onChange: () => void) {
  const key = userId ? handledKey(userId) : null;
  const onStorage = (e: StorageEvent) => {
    if (!key || e.key !== key || !userId) return;
    handledCache.set(userId, readHandled(userId));
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(HANDLED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HANDLED_EVENT, onChange);
  };
}

/**
 * Marks written from this browser's clock right after a DM send
 * (`provisional`), by `userId\nitemKey` → the value written. Until anything
 * else writes the item, the server's own time for that message may replace
 * one, even with an earlier time (`exact`). In memory only: after a reload
 * the mark is just a mark.
 */
const provisionalMarks = new Map<string, string>();

/** Store canonical ISO so marks compare as times, whatever format came in. */
function canonicalTime(raw: string): string {
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : raw;
}

function notBefore(a: string, b: string): boolean {
  const am = Date.parse(a);
  const bm = Date.parse(b);
  return Number.isFinite(am) && Number.isFinite(bm) ? am >= bm : a >= b;
}

/**
 * Handled through `through`. Marks only move forward, except that an
 * `exact` time from the server replaces a `provisional` one written from
 * our own clock (which can run ahead and would swallow a quick reply).
 */
export function markItemHandled(
  userId: string | undefined | null,
  itemKey: string,
  through: string,
  opts?: { provisional?: boolean; exact?: boolean },
): void {
  if (!userId || !itemKey) return;
  const value = canonicalTime(through);
  const id = `${userId}\n${itemKey}`;
  const cur = handledSnapshot(userId);
  const existing = cur[itemKey];
  const replacesProvisional =
    Boolean(opts?.exact) && existing !== undefined && provisionalMarks.get(id) === existing;
  if (!replacesProvisional && existing && notBefore(existing, value)) return;
  if (opts?.provisional) provisionalMarks.set(id, value);
  else provisionalMarks.delete(id);
  if (existing === value) return;
  writeHandled(userId, { ...cur, [itemKey]: value });
}

export function unmarkItemHandled(userId: string | undefined | null, itemKey: string): void {
  if (!userId || !itemKey) return;
  provisionalMarks.delete(`${userId}\n${itemKey}`);
  const cur = handledSnapshot(userId);
  if (!(itemKey in cur)) return;
  const next = { ...cur };
  delete next[itemKey];
  writeHandled(userId, next);
}

/** Live map of handled items for the signed-in user. */
export function useHandledItems(userId: string | undefined | null): HandledMap {
  const subscribe = useCallback(
    (cb: () => void) => subscribeHandled(userId, cb),
    [userId],
  );
  return useSyncExternalStore(
    subscribe,
    () => handledSnapshot(userId),
    () => EMPTY_MAP,
  );
}

// Hidden posts --------------------------------------------------------------

const hiddenCache = new Map<string, { raw: string; set: ReadonlySet<string> }>();

function hiddenSnapshot(userId: string | undefined | null): ReadonlySet<string> {
  if (!userId) return EMPTY_SET;
  const list = loadHiddenInboxPublications(userId);
  const raw = list.join(",");
  const cached = hiddenCache.get(userId);
  if (cached && cached.raw === raw) return cached.set;
  const set = new Set(list);
  hiddenCache.set(userId, { raw, set });
  return set;
}

/** Publications hidden from Needs reply ("Hide post"). */
export function useHiddenPublications(userId: string | undefined | null): ReadonlySet<string> {
  const subscribe = useCallback(
    (cb: () => void) => subscribeHiddenInboxPublications(userId, cb),
    [userId],
  );
  return useSyncExternalStore(
    subscribe,
    () => hiddenSnapshot(userId),
    () => EMPTY_SET,
  );
}

export { hideInboxPublication, unhideInboxPublication };

/**
 * Free tools → Social0 without losing work.
 * - Handoff: what a tool made (files, text, thread) waits in IndexedDB while the
 *   visitor signs in / onboards, then `/dashboard/new?handoff=1` attaches it.
 * - Drafts: each tool's work-in-progress, restored when the visitor comes back.
 * Files are too big for localStorage, so both live in IndexedDB; a tiny
 * localStorage flag lets sync code (onboarding finish) know a handoff waits.
 */
export type Handoff = { files?: File[]; text?: string; parts?: string[]; from: string; at: number };
export type KV = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
};

export const HANDOFF_PATH = "/dashboard/new?handoff=1";
const HANDOFF_KEY = "handoff";
const FLAG = "s0_handoff_at";
const HANDOFF_TTL = 24 * 60 * 60 * 1000;
const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;

function idb(): KV {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("social0-tools", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) =>
    open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const req = fn(db.transaction("kv", mode).objectStore("kv"));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => reject(req.error);
        }),
    );
  return {
    get: (k) => run("readonly", (s) => s.get(k)),
    set: (k, v) => run("readwrite", (s) => s.put(v, k)),
    del: (k) => run("readwrite", (s) => s.delete(k)),
  };
}

let store: KV | null = null;
const kv = () => (store ??= idb());
/** Tests swap in an in-memory store. */
export function setToolStore(s: KV) {
  store = s;
}

function flag(value: number | null) {
  try {
    if (value === null) localStorage.removeItem(FLAG);
    else localStorage.setItem(FLAG, String(value));
  } catch {
    // Storage blocked: the IndexedDB copy still works on this page.
  }
}

export async function saveHandoff(h: Omit<Handoff, "at">, now = Date.now()): Promise<void> {
  await kv().set(HANDOFF_KEY, { ...h, at: now });
  flag(now);
}

/** Sync check for code that can't await (where to land after onboarding). */
export function hasPendingHandoff(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(FLAG));
    return at > 0 && now - at < HANDOFF_TTL;
  } catch {
    return false;
  }
}

let taking: Promise<Handoff | null> | null = null;
/** Read the handoff once and clear it (shared promise so a double mount gets the same result). */
export function takeHandoff(now = Date.now()): Promise<Handoff | null> {
  taking ??= (async () => {
    try {
      const h = (await kv().get(HANDOFF_KEY)) as Handoff | undefined;
      await kv().del(HANDOFF_KEY);
      flag(null);
      return h && now - h.at < HANDOFF_TTL ? h : null;
    } catch {
      return null;
    }
  })();
  const p = taking;
  void p.finally(() => {
    window.setTimeout(() => (taking = null), 1000);
  });
  return p;
}

export async function saveToolDraft(tool: string, value: unknown, now = Date.now()): Promise<void> {
  try {
    await kv().set(`draft:${tool}`, { value, at: now });
  } catch {
    // Private mode etc.: the tool still works, it just won't remember.
  }
}

export async function loadToolDraft<T>(tool: string, now = Date.now()): Promise<T | null> {
  try {
    const d = (await kv().get(`draft:${tool}`)) as { value: T; at: number } | undefined;
    return d && now - d.at < DRAFT_TTL ? d.value : null;
  } catch {
    return null;
  }
}

/** Save what a tool made, then open the composer (through sign-in / onboarding if needed). */
export async function postEverywhere(
  h: Omit<Handoff, "at">,
  signedIn: boolean,
  navigate: (to: string) => void,
  signIn: (to: string) => string,
): Promise<void> {
  try {
    await saveHandoff(h);
  } catch {
    // IndexedDB blocked: still open the composer, just without the file.
  }
  navigate(signedIn ? HANDOFF_PATH : signIn(HANDOFF_PATH));
}


import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

const STORAGE_PREFIX = "remembered-accounts-";

export type RememberedAccountsData = {
  remember: boolean;
  accountIds: string[];
};

/**
 * Suffix for `localStorage` key `remembered-accounts-${suffix}` - one unique key per surface.
 * Do not use a generic `post-form` key; each form uses its own entry.
 */
export const REMEMBERED_ACCOUNT_KEYS = {
  textPost: "post-form-text",
  imagePost: "post-form-image",
  videoPost: "post-form-video",
  threadsPost: "post-form-threads",
  collectionPost: "post-form-collection",
  bulkImage: "bulk-image",
  bulkVideo: "bulk-video",
  /** Reserved for `/dashboard/composer` if account selection is added there. */
  composer: "composer",
} as const;

function parseRememberedPayload(raw: string): RememberedAccountsData | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (
      data &&
      typeof data === "object" &&
      "remember" in data &&
      typeof (data as RememberedAccountsData).remember === "boolean" &&
      "accountIds" in data &&
      Array.isArray((data as RememberedAccountsData).accountIds)
    ) {
      return {
        remember: (data as RememberedAccountsData).remember,
        accountIds: (data as RememberedAccountsData).accountIds.filter(
          (id): id is string => typeof id === "string",
        ),
      };
    }
  } catch (_) {}
  return null;
}

function readStored(key: string): RememberedAccountsData {
  if (typeof window === "undefined") return { remember: false, accountIds: [] };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return { remember: false, accountIds: [] };
    const parsed = parseRememberedPayload(raw);
    if (parsed) return parsed;
  } catch (_) {}
  return { remember: false, accountIds: [] };
}

function writeStored(key: string, data: RememberedAccountsData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch (_) {}
}

/**
 * After accounts load, apply remembered selection if the initial `useState` ran with an empty
 * account list (common on first client paint before `accounts` is ready).
 *
 * Returns `{ isHydrated }` - becomes `true` once the loading phase is done and any stored
 * selection has been applied. The caller's `persistSelection` effect must wait for this before
 * writing to localStorage, otherwise it would fire on the initial render with an empty
 * `selectedIds` and wipe the stored account IDs before they can be restored.
 */
export function useApplyRememberedSelectionWhenReady(options: {
  skip: boolean;
  accountsLoading: boolean;
  accounts: ReadonlyArray<{ id: string; tokenExpired?: boolean }>;
  getInitialSelectedIds: (valid: Set<string>) => Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
}): { isHydrated: boolean } {
  const [isHydrated, setIsHydrated] = useState(false);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (options.skip) {
      appliedRef.current = false;
      setIsHydrated(false);
      return;
    }
    if (options.accountsLoading) return;
    if (appliedRef.current) return;

    // Mark hydrated first so the persist effect can safely write on the next render.
    appliedRef.current = true;
    setIsHydrated(true);

    const validIds = new Set(
      options.accounts.filter((a) => !a.tokenExpired).map((a) => a.id),
    );
    if (validIds.size === 0) return;
    const restored = options.getInitialSelectedIds(validIds);
    if (restored.size === 0) return;
    options.setSelectedIds((prev) => {
      if (prev.size > 0) return prev;
      return restored;
    });
  }, [
    options.skip,
    options.accountsLoading,
    options.accounts,
    options.getInitialSelectedIds,
    options.setSelectedIds,
  ]);

  return { isHydrated };
}

/**
 * Hook to persist "Remember account selection" per form (post form, bulk image, bulk video).
 * Returns stored state and helpers to update it. Parent should:
 * - Initialize selectedIds from getInitialSelectedIds(validAccountIds) when appropriate.
 * - Call persistSelection(selectedIds) when remember is true and selection changes.
 * - Call `useApplyRememberedSelectionWhenReady` when not editing a draft/scheduled post so
 *   selection restores after `accounts` finishes loading.
 */
export function useRememberedAccounts(key: string) {
  const [stored, setStored] = useState<RememberedAccountsData>(() =>
    readStored(key),
  );

  const setRemember = useCallback(
    (remember: boolean) => {
      setStored((prev) => {
        const next = { ...prev, remember };
        writeStored(key, next);
        return next;
      });
    },
    [key],
  );

  /** Persist selected account IDs under this form's key (call when Remember is on and selection changes). */
  const persistSelection = useCallback(
    (ids: Set<string>) => {
      const accountIds = Array.from(ids);
      setStored((prev) => {
        const next = { ...prev, accountIds };
        writeStored(key, next);
        return next;
      });
    },
    [key],
  );

  /**
   * Sets Remember and writes `accountIds` in one storage write (avoids remember:true with stale ids).
   */
  const setRememberAndSelection = useCallback(
    (remember: boolean, ids: Set<string>) => {
      const accountIds = Array.from(ids);
      setStored((prev) => {
        const next = { ...prev, remember, accountIds };
        writeStored(key, next);
        return next;
      });
    },
    [key],
  );

  /** Returns the set of account IDs that were stored when remember was true (for initializing selection). */
  const getInitialSelectedIds = useCallback(
    (validAccountIds: Set<string>): Set<string> => {
      if (!stored.remember || stored.accountIds.length === 0) return new Set();
      return new Set(stored.accountIds.filter((id) => validAccountIds.has(id)));
    },
    [stored.remember, stored.accountIds],
  );

  return {
    remember: stored.remember,
    setRemember,
    persistSelection,
    setRememberAndSelection,
    getInitialSelectedIds,
    rememberedAccountIds: stored.accountIds,
  };
}

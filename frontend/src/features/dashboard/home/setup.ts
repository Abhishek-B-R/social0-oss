import { useCallback, useSyncExternalStore } from "react";
import type { HomePermissions, HomeSetupState } from "@/api/dashboard";
import { useSession } from "@/lib/auth-client";

/*
 * "Get set up" checklist: steps derived from real state (`dashboard.getHome`
 * → `setup`), plus a per-user visibility flag in localStorage:
 *   visible   → card on Home
 *   hidden    → collapsed to the sidebar SetupPill (click to bring it back)
 *   dismissed → gone everywhere
 */

export type SetupStepId = "connect" | "agent" | "publish" | "schedule" | "invite";

export type SetupStep = {
  id: SetupStepId;
  title: string;
  /** One line under the title for the current step. */
  hint: string;
  done: boolean;
  optional: boolean;
  /** False when the user's role can't do it; we say who can instead. */
  actionable: boolean;
};

export function buildSetupSteps(
  setup: HomeSetupState,
  permissions: HomePermissions,
): SetupStep[] {
  const steps: SetupStep[] = [
    {
      id: "connect",
      title: "Connect your first account",
      hint: "Pick a network and sign in. Social0 only posts what you approve.",
      done: setup.hasAccounts,
      optional: false,
      actionable: permissions.canManageConnections,
    },
    {
      id: "agent",
      title: "Connect your AI agent",
      hint: "Let ChatGPT, Claude, Cursor or a script draft and schedule posts for you.",
      done: setup.hasAgent,
      optional: false,
      actionable: true,
    },
    {
      id: "publish",
      title: "Publish your first post",
      hint: "Write once, pick accounts, publish now or add it to the queue.",
      done: setup.hasPublished,
      optional: false,
      actionable: permissions.canCreatePosts,
    },
    {
      id: "schedule",
      title: "Set your posting schedule",
      hint: "Pick the times your queue fills, so “Add to queue” just works.",
      done: setup.hasQueueSlots,
      optional: false,
      actionable: permissions.canCreatePosts,
    },
  ];
  if (setup.teamsAvailable && permissions.canInvite) {
    steps.push({
      id: "invite",
      title: "Invite a teammate",
      hint: "Add someone to write, reply to comments or just read analytics.",
      done: setup.hasInvitedTeammate,
      optional: true,
      actionable: true,
    });
  }
  return steps;
}

export function setupProgress(steps: SetupStep[]) {
  const required = steps.filter((s) => !s.optional);
  const doneRequired = required.filter((s) => s.done).length;
  return {
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    /** Every required step is done: the checklist retires itself. */
    complete: doneRequired === required.length,
    next: steps.find((s) => !s.done && s.actionable) ?? steps.find((s) => !s.done) ?? null,
  };
}

/** Roles that only read or reply never see the checklist. */
export function canSeeSetup(permissions: HomePermissions): boolean {
  return permissions.canCreatePosts || permissions.canManageConnections;
}

// ---------------------------------------------------------------------------
// Visibility store
// ---------------------------------------------------------------------------

export type SetupVisibility = "visible" | "hidden" | "dismissed";

const KEY_PREFIX = "social0.home.setup.";
const listeners = new Set<() => void>();

function storageKey(userId: string | null | undefined) {
  return `${KEY_PREFIX}${userId ?? "anon"}`;
}

function read(userId: string | null | undefined): SetupVisibility {
  try {
    const v = window.localStorage.getItem(storageKey(userId));
    return v === "hidden" || v === "dismissed" ? v : "visible";
  } catch {
    return "visible";
  }
}

function write(userId: string | null | undefined, next: SetupVisibility) {
  try {
    if (next === "visible") window.localStorage.removeItem(storageKey(userId));
    else window.localStorage.setItem(storageKey(userId), next);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
    memory.set(storageKey(userId), next);
  }
  for (const l of listeners) l();
}

const memory = new Map<string, SetupVisibility>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(KEY_PREFIX)) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Per-user checklist visibility shared by Home and the sidebar pill. */
export function useSetupVisibility(): [SetupVisibility, (next: SetupVisibility) => void] {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const value = useSyncExternalStore(
    subscribe,
    () => memory.get(storageKey(userId)) ?? read(userId),
    () => "visible" as SetupVisibility,
  );
  const set = useCallback((next: SetupVisibility) => write(userId, next), [userId]);
  return [value, set];
}

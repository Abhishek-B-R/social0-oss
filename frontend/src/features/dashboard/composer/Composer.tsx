import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useBlocker, useNavigate, type BlockerFunction } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Expand,
  ImagePlus,
  Info,
  ListPlus,
  Loader2,
  PanelRightOpen,
  Upload,
  X,
} from "lucide-react";
import Link from "@/components/AppLink";
import { AutoResizeTextarea } from "@/components/ui/AutoResizeTextarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  shortcutLabel,
  useDashboardBasePath,
  useDashboardPath,
  type ComposerOpenOptions,
} from "@/components/app";
import {
  deleteDraft,
  getDraft,
  getPostToEdit,
  getScheduledPost,
  updateDraft,
} from "@/api/posts";
import { useIsGuest } from "@/lib/use-is-guest";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { loadDashboardLayoutData } from "@/api/dashboard-data";
import {
  REMEMBERED_ACCOUNT_KEYS,
  useRememberedAccounts,
} from "@/lib/remembered-accounts";
import { useRememberedAutoRepostAutoPlug } from "@/lib/remembered-autorepost-autoplug";
import { getRememberedBoard, getRememberedLink } from "@/lib/pinterest-remembered";
import { freePublishBlockReason } from "@/lib/free-tier-publish";
import { useLimitModal } from "@/components/billing/use-limit-modal";
import { getPlanLimits } from "@/lib/plans";
import { shouldAutoFocusOnMount } from "@/lib/touch";
import { cn } from "@/lib/utils";
import { runSubmit } from "@/features/dashboard/publish/run-submit";
import { heldQueueTimes, useTrayJobs } from "@/features/dashboard/publish/publish-store";
import { useIsDesktop } from "@/features/dashboard/inbox/use-is-desktop";
import { AccountPicker } from "./AccountPicker";
import {
  clearLocalDraft,
  clearPendingRestore,
  getPendingRestore,
  hasContent,
  loadLocalDraft,
  newerScope,
  saveLocalDraft,
  setPendingRestore,
  type HandOffSlots,
} from "./autosave";
import { detectContentType } from "./content-type";
import {
  cropImage,
  intakeFiles,
  localId,
  posterFor,
  revokeMedia,
} from "./media-intake";
import { MediaTray } from "./MediaTray";
import { NetworkStrip } from "./NetworkStrip";
import {
  buildMetadata,
  contentFor,
  draftFromPost,
  emptyDraft,
  publishableParts,
  withPinterestDefaults,
} from "./payload";
import { Popover } from "./Popover";
import { PreviewRail } from "./PreviewRail";
import { THREAD_MAX_MEDIA_PER_POST, validateComposer } from "./rules";
import { SchedulePanel } from "./SchedulePanel";
import { SettingsPills } from "./SettingsPills";
import { SplitButton, type SplitMenuItem } from "./SplitButton";
import { ThreadEditor } from "./ThreadEditor";
import { formatShortTime, safeTimezone } from "./nl-time";
import {
  useBestTimeHistory,
  useComposerAccounts,
  useComposerSettings,
  useNextSlot,
} from "./use-composer-data";
import { bestTimeFromPublications } from "./best-time";
import type {
  ComposerAccount,
  ComposerContentType,
  ComposerDraft,
  ComposerFix,
  ComposerIssue,
  ComposerMode,
  ComposerPart,
  SettingKey,
  SubmitAction,
} from "./types";

export type ComposerProps = {
  variant: "page" | "modal";
  mode: ComposerMode;
  /** Prefill from `openComposer()` / `/new?text=&at=&accounts=&intent=`. */
  prefill?: ComposerOpenOptions;
  /** Old `/create/threads`: start with a second post. */
  startAsThread?: boolean;
  /** Called after a submit (modal closes; page navigates). */
  onDone: () => void;
  /** Modal only: close without submitting. */
  onClose?: () => void;
  /** Modal only: continue in the full-page composer. */
  onExpand?: (draft: ComposerDraft, slots: HandOffSlots) => void;
};

type SaveState = "idle" | "saving" | "saved" | "local" | "error" | "pending";

const PREVIEW_PREF_KEY = "social0-composer-preview-collapsed";

function readPreviewPref(): boolean {
  try {
    return localStorage.getItem(PREVIEW_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function goToSignIn(): void {
  window.location.assign(signInUrl(window.location.pathname + window.location.search));
}

function isPast(d: Date): boolean {
  return d.getTime() <= Date.now();
}

function hasFiles(e: DragEvent): boolean {
  return [...e.dataTransfer.types].includes("Files");
}

function clipboardFiles(e: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const out: File[] = [];
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f && (f.type.startsWith("image/") || f.type.startsWith("video/"))) out.push(f);
  }
  return out;
}

/** Per-account captions minus the ones for `network`'s accounts. */
function withoutNetworkCaptions(
  captions: Record<string, string> | undefined,
  accounts: readonly { id: string; platform: string }[],
  network: string,
): Record<string, string> | undefined {
  if (!captions) return captions;
  const next = { ...captions };
  for (const a of accounts) if (a.platform === network) delete next[a.id];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Time and accounts a prefill asks for (calendar slot, "post to X"). */
function prefillTarget(
  prefill: ComposerOpenOptions | undefined,
): Pick<ComposerDraft, "scheduledAt" | "queueSlotId"> & { accountIds: string[] | null } {
  const at = prefill?.scheduledAt ? new Date(prefill.scheduledAt) : null;
  const futureAt =
    at && !Number.isNaN(at.getTime()) && at.getTime() > Date.now() ? at.toISOString() : null;
  return {
    accountIds: prefill?.accounts?.length ? prefill.accounts : null,
    scheduledAt: futureAt,
    queueSlotId: futureAt ? (prefill?.queueSlotId ?? null) : null,
  };
}

/** A new, empty composer with the prefill's text, time and accounts applied. */
function freshDraft(props: ComposerProps): ComposerDraft {
  const base = emptyDraft();
  const p = props.prefill;
  const target = prefillTarget(p);
  const draft: ComposerDraft = {
    ...base,
    parts: p?.parts?.length
      ? p.parts.map((text, i) => ({ id: i === 0 ? base.parts[0]!.id : localId("p"), text, media: [] }))
      : [{ id: base.parts[0]!.id, text: p?.text ?? "", media: [] }],
    accountIds: target.accountIds ?? [],
    scheduledAt: target.scheduledAt,
    queueSlotId: target.queueSlotId,
  };
  const prefilled = !!(p?.text || p?.parts?.length || p?.files?.length || target.accountIds || p?.scheduledAt);
  if (!prefilled && props.startAsThread) {
    return { ...draft, parts: [...draft.parts, { id: localId("p"), text: "", media: [] }] };
  }
  return draft;
}

/**
 * Which saved post a new composer keeps aside instead of overwriting it:
 * - null: none. This post saves to the main slot.
 * - "main": an older unsent post is in the main slot. This post saves to the
 *   newer slot (`newerScope`) until the person opens or discards the older one.
 * - "newer": both slots hold other posts. This post isn't saved until the
 *   person opens or discards the one in the newer slot.
 */
type OlderSlot = null | "main" | "newer";

/** Where a post goes, given which slots already hold other posts. */
function olderSlot(mainTaken: boolean, newerTaken: boolean): OlderSlot {
  if (!mainTaken) return null;
  return newerTaken ? "newer" : "main";
}

function savedContent(scope: string): ComposerDraft | null {
  const saved = loadLocalDraft(scope);
  return saved && hasContent(saved.draft) ? saved.draft : null;
}

/**
 * Seed for a brand-new composer: hand-off > local autosave (with a
 * calendar slot / account prefill applied on top) > prefill.
 *
 * A prefill that brings its own text or files starts from that content, and
 * so does a hand-off. An unsent post already saved on this device stays
 * saved (`older`) until the person opens or discards it, so the new content
 * doesn't overwrite it.
 */
function initialDraft(
  props: ComposerProps,
  scope: string,
): { draft: ComposerDraft; restoredLocal: boolean; older: OlderSlot; ownsNewer: boolean } {
  const pending = getPendingRestore();
  if (props.mode.kind !== "new") {
    return { draft: pending?.draft ?? emptyDraft(), restoredLocal: false, older: null, ownsNewer: false };
  }

  const main = savedContent(scope);
  const newer = savedContent(newerScope(scope));
  if (pending) {
    // "Open full page" says where the modal was saving this post. A reopened
    // post (sent, then failed) was cleared when it was sent, so any saved
    // post is another one.
    const ownsNewer = pending.slots?.ownsNewer ?? false;
    const mainTaken = !!main && (pending.slots?.keepsOlder ?? true);
    return {
      draft: pending.draft,
      restoredLocal: false,
      older: olderSlot(mainTaken, !!newer && !ownsNewer),
      ownsNewer,
    };
  }

  const p = props.prefill;
  if (p?.text || p?.files?.length) {
    return { draft: freshDraft(props), restoredLocal: false, older: olderSlot(!!main, !!newer), ownsNewer: false };
  }
  // A post written while an older one was kept aside wins: it is the latest.
  const saved = newer ?? main;
  if (saved) {
    const target = prefillTarget(p);
    return {
      draft: {
        ...saved,
        accountIds: target.accountIds ?? saved.accountIds,
        scheduledAt: target.scheduledAt,
        queueSlotId: target.queueSlotId,
      },
      restoredLocal: true,
      older: newer && main ? "main" : null,
      ownsNewer: !!newer,
    };
  }
  return { draft: freshDraft(props), restoredLocal: false, older: null, ownsNewer: false };
}

/** Files added in this composer that the server doesn't have yet. */
function hasNewFiles(draft: ComposerDraft): boolean {
  return draft.parts.some((p) => p.media.some((m) => !m.existingId));
}

/**
 * What autosave stores for an existing draft: everything but the files added
 * here, which upload only on an explicit save. The server keeps the draft's
 * media and the new files stay in the composer, pending. Null when the draft
 * can't be saved as it stands.
 */
function draftAutosavePayload(
  draft: ComposerDraft,
  accounts: readonly ComposerAccount[],
): { content: string; mediaIds: string[]; metadata: Record<string, unknown> } | null {
  const kept: ComposerDraft = {
    ...draft,
    parts: draft.parts.map((p) => ({ ...p, media: p.media.filter((m) => !!m.existingId) })),
  };
  const type = detectContentType(kept.parts, kept.initialContentType);
  const content = contentFor(kept, type);
  if (!content || draft.accountIds.length === 0) return null;
  // updatePost replaces posts.metadata, and per-network settings are built
  // per account: with any selected account missing (accounts failed to
  // load, or it was disconnected) the save would drop its settings.
  const accs = accounts.filter((a) => draft.accountIds.includes(a.id));
  if (accs.length !== draft.accountIds.length) return null;
  const partMediaIds = publishableParts(kept).map((p) =>
    p.media.map((m) => m.existingId).filter((id): id is string => !!id),
  );
  return {
    content,
    mediaIds: partMediaIds.flat(),
    metadata: buildMetadata({ draft: kept, type, accounts: accs, partMediaIds, action: "draft" }),
  };
}

/**
 * One-screen composer (mock 03·A + 04·A): accounts, caption with
 * per-network overrides, media with ratio fixes, threads, network setting
 * pills, preview rail, autosave, and the split publish button. Used as a
 * full page (`/new`) and as a modal from anywhere.
 */
export function Composer(props: ComposerProps) {
  const { variant, mode } = props;
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const basePath = useDashboardBasePath();
  const queryClient = useQueryClient();
  const posthog = usePostHog();
  const isGuest = useIsGuest();
  const { data: session, isPending: sessionPending } = useSession();
  // Same query as the layout (role gates); read here so a failure can retry.
  const layout = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    enabled: !!session,
    staleTime: 60_000,
  });
  const perms = {
    ready: layout.isSuccess,
    canCreatePosts: layout.data?.canCreatePosts ?? false,
  };
  const settings = useComposerSettings();
  const signedIn = !!session;
  const { accounts, isLoading: accountsLoading, isError: accountsError, refetch: refetchAccounts, canManageConnections } =
    useComposerAccounts(signedIn);
  // Slots taken by queued posts still uploading (the server can't see them yet).
  const trayJobs = useTrayJobs();
  const heldSlots = useMemo(() => heldQueueTimes(trayJobs), [trayJobs]);
  const nextSlotQ = useNextSlot(signedIn && perms.canCreatePosts, heldSlots);
  const nextSlot = nextSlotQ.data ?? null;

  const scope = `composer:${basePath}`;
  const [init] = useState(() => initialDraft(props, scope));
  const [{ draft, restoredLocal }, setState] = useState(() => ({
    draft: init.draft,
    restoredLocal: init.restoredLocal,
  }));
  // An older unsent post this composer must not overwrite (see OlderSlot).
  const [older, setOlder] = useState<OlderSlot>(init.older);
  const newerKey = newerScope(scope);
  // This post is the one saved in the newer slot.
  const ownsNewerRef = useRef(init.ownsNewer);
  const [rev, setRev] = useState(0);
  const setDraft = useCallback(
    (next: ComposerDraft | ((d: ComposerDraft) => ComposerDraft), userEdit = true) => {
      setState((s) => ({
        ...s,
        draft: typeof next === "function" ? next(s.draft) : next,
      }));
      if (userEdit) setRev((r) => r + 1);
    },
    [],
  );
  const update = useCallback(
    (patch: Partial<ComposerDraft> | ((d: ComposerDraft) => Partial<ComposerDraft>)) =>
      setDraft((d) => ({ ...d, ...(typeof patch === "function" ? patch(d) : patch) })),
    [setDraft],
  );
  // Latest draft for async handlers (file intake) that must not use stale state.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // The hand-off is read once, then cleared.
  useEffect(() => {
    clearPendingRestore(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- load the post being edited ------------------------------------------
  const [restoredFromHandOff] = useState(() => getPendingRestore() != null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    mode.kind === "new" || restoredFromHandOff ? "idle" : "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  useEffect(() => {
    if (mode.kind === "new" || restoredFromHandOff) return;
    // Per-network settings (TikTok, Pinterest, captions) are restored per
    // account, so wait for the accounts: a draft loaded without them would
    // come back without those settings, and autosave would drop them.
    if (!signedIn || accountsLoading || accountsError) return;
    let cancelled = false;
    (async () => {
      try {
        const res =
          mode.kind === "draft"
            ? await getDraft(mode.postId).then((r) => (r.success ? { ok: true as const, post: { ...r.draft, queueSlotId: null } } : { ok: false as const, error: r.error }))
            : mode.kind === "scheduled"
              ? await getScheduledPost(mode.postId).then((r) => (r.success ? { ok: true as const, post: r.post } : { ok: false as const, error: r.error }))
              : await getPostToEdit(mode.postId).then((r) => (r.success ? { ok: true as const, post: r.post } : { ok: false as const, error: r.error }));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(res.error);
          setLoadState("error");
          return;
        }
        const fromPost = draftFromPost({ ...res.post, id: mode.postId }, accounts, {
          keepSchedule: mode.kind !== "edit",
        });
        // "Edit for <network>" on one failed delivery (`?edit=<id>&accounts=<id>`):
        // post again to that account only, never to the ones already live.
        const only = mode.kind === "edit" ? props.prefill?.accounts : undefined;
        const loaded = only?.length
          ? { ...fromPost, accountIds: fromPost.accountIds.filter((id) => only.includes(id)) }
          : fromPost;
        setDraft({ ...loaded, pinterest: withPinterestDefaults(loaded, accounts) }, false);
        setLoadState("idle");
      } catch {
        if (cancelled) return;
        setLoadError(null);
        setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // accounts identity changes on refetch; load once per post / retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, "postId" in mode ? mode.postId : null, signedIn, accountsLoading, accountsError, loadNonce]);

  // ---- remembered accounts + automations -----------------------------------
  const remembered = useRememberedAccounts(REMEMBERED_ACCOUNT_KEYS.composer);
  const legacyRemembered = useRememberedAccounts(REMEMBERED_ACCOUNT_KEYS.textPost);
  const appliedRemember = useRef(false);
  useEffect(() => {
    if (appliedRemember.current || !signedIn || accountsLoading || accountsError) return;
    if (mode.kind !== "new") return;
    appliedRemember.current = true;
    const valid = new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id));
    if (draft.accountIds.length > 0) {
      // Prefilled / restored ids: drop ones not in this workspace or expired.
      const kept = draft.accountIds.filter((id) => valid.has(id));
      if (kept.length !== draft.accountIds.length) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDraft((d) => ({ ...d, accountIds: kept }), false);
      }
      return;
    }
    let ids = remembered.getInitialSelectedIds(valid);
    if (ids.size === 0 && !remembered.remember) ids = legacyRemembered.getInitialSelectedIds(valid);
    // Remembered selection lives in localStorage and applies once accounts load.
    if (ids.size > 0) setDraft((d) => ({ ...d, accountIds: [...ids] }), false);
  }, [signedIn, accountsLoading, accountsError, accounts, mode.kind, draft.accountIds, remembered, legacyRemembered, setDraft]);
  useEffect(() => {
    if (!appliedRemember.current || !remembered.remember) return;
    remembered.persistSelection(new Set(draft.accountIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.accountIds, remembered.remember]);

  const autoRemember = useRememberedAutoRepostAutoPlug();
  const selected = useMemo(
    () => accounts.filter((a) => draft.accountIds.includes(a.id)),
    [accounts, draft.accountIds],
  );
  const hasX = selected.some((a) => a.platform === "twitter_x");
  const restoredAutoRef = useRef(false);
  useEffect(() => {
    if (!hasX) {
      restoredAutoRef.current = false;
      return;
    }
    if (!autoRemember.remember || restoredAutoRef.current || mode.kind !== "new") return;
    restoredAutoRef.current = true;
    const { autoRepostConfig, autoPlugConfig } = autoRemember.getInitialState();
    setDraft(
      (d) => ({
        ...d,
        autoRepost: d.autoRepost ?? (settings.allowAutoRepost ? autoRepostConfig : null),
        autoPlug: d.autoPlug ?? (settings.allowAutoPlug ? autoPlugConfig : null),
      }),
      false,
    );
  }, [hasX, autoRemember, mode.kind, settings.allowAutoPlug, settings.allowAutoRepost, setDraft]);
  useEffect(() => {
    if (!autoRemember.remember || !hasX) return;
    autoRemember.persistAutoRepost(!!draft.autoRepost, draft.autoRepost);
    autoRemember.persistAutoPlug(!!draft.autoPlug, draft.autoPlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.autoRepost, draft.autoPlug, autoRemember.remember, hasX]);

  // Pinterest: saved default board, then the board remembered on this device.
  useEffect(() => {
    const pins = selected.filter((a) => a.platform === "pinterest");
    if (pins.length === 0) return;
    let next = withPinterestDefaults(draft, pins);
    for (const a of pins) {
      if (next[a.id]?.boardId) continue;
      const board = getRememberedBoard(a.id);
      if (!board) continue;
      next = {
        ...next,
        [a.id]: {
          boardId: board,
          title: next[a.id]?.title ?? "",
          link: next[a.id]?.link || getRememberedLink(a.id) || "",
          rememberBoard: true,
          rememberLink: !!getRememberedLink(a.id),
        },
      };
    }
    // Saved boards come from account metadata / this device; fill them in once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next !== draft.pinterest) setDraft((d) => ({ ...d, pinterest: next }), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // ---- derived -------------------------------------------------------------
  const type: ComposerContentType = detectContentType(draft.parts, draft.initialContentType);
  const isThread = type === "threads";
  const [tiktokMaxDuration, setTiktokMaxDuration] = useState<Record<string, number>>({});
  const validation = useMemo(
    () => validateComposer({ draft, accounts, contentType: type, tiktokMaxDuration }),
    [draft, accounts, type, tiktokMaxDuration],
  );
  const tz = safeTimezone(draft.timezoneOverride ?? settings.timezone);
  const pickedAt = useMemo(
    () => (draft.scheduledAt ? new Date(draft.scheduledAt) : null),
    [draft.scheduledAt],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const pickedPast = !!pickedAt && pickedAt.getTime() <= now;
  const slotAt = nextSlot ? new Date(nextSlot.scheduledAt) : null;

  const publishBlockedReason = isGuest
    ? "Sign in to post."
    : freePublishBlockReason(settings.tier, settings.freePostsUsed, "now");
  // Free posts used up: the plan-limit moment (drafts still save).
  const { openLimit, limitModal } = useLimitModal();
  const openFreePostsLimit = () => openLimit("free_posts", { currentTier: settings.tier });
  // A post that is already scheduled was charged when it was first scheduled,
  // so rescheduling it or publishing it now is free (updatePostInScope only
  // charges drafts). Guests are blocked from everything but drafts.
  const freeLimitBlocks = (action: SubmitAction): boolean =>
    action !== "draft" && !!publishBlockedReason && (isGuest || mode.kind !== "scheduled");

  // Home's "Publish now…" opens on Publish now even when a queue exists;
  // "Add to queue" in the split menu switches back.
  const [preferNow, setPreferNow] = useState(
    () => mode.kind === "new" && props.prefill?.intent === "now",
  );
  const queueOpen = !!slotAt && slotAt.getTime() > now;
  const primaryAction: Exclude<SubmitAction, "draft"> = pickedAt
    ? "schedule"
    : queueOpen && !preferNow
      ? "queue"
      : "now";

  const allIssues: ComposerIssue[] = useMemo(() => {
    const list = [...validation.issues];
    if (pickedPast) {
      list.push({
        id: "past",
        message: "The time you picked has passed. Pick a new time.",
        accountIds: [],
        fix: { kind: "schedule", label: "Pick a time" },
      });
    }
    if (publishBlockedReason && !isGuest) {
      list.push({
        id: "free-limit",
        message: publishBlockedReason,
        accountIds: [],
        fix: { kind: "upgrade", label: "See plans" },
      });
    }
    return list;
  }, [validation.issues, pickedPast, publishBlockedReason, isGuest]);
  // What blocks a given action. "Time has passed" only matters when scheduling
  // for the picked time: publish now ignores it, and a fresh time from the
  // schedule popover replaces it. The free-post limit only blocks actions
  // that charge (see freeLimitBlocks).
  const issuesFor = (action: SubmitAction, freshTime = false): ComposerIssue[] =>
    allIssues.filter(
      (i) =>
        (i.id !== "past" || (action === "schedule" && !freshTime)) &&
        (i.id !== "free-limit" || freeLimitBlocks(action)),
    );
  const okCount = validation.okAccountIds.length;

  // Problems stay out of sight until there is something to check: an empty
  // composer reads neutral. They show once text or media exists, or after a
  // submit attempt.
  const [attempted, setAttempted] = useState(false);
  const showIssues = attempted || hasContent(draft);
  const visibleIssues = useMemo(
    () => (showIssues ? validation.issues : []),
    [showIssues, validation.issues],
  );

  const settingsNeedingAttention = useMemo(() => {
    const s = new Set<SettingKey>();
    for (const i of visibleIssues) {
      if (i.fix?.kind === "open-setting") s.add(i.fix.setting);
    }
    return s;
  }, [visibleIssues]);

  const problemsByAccount = useMemo(() => {
    const out: Record<string, string> = {};
    for (const i of visibleIssues) for (const id of i.accountIds) out[id] ??= i.message;
    return out;
  }, [visibleIssues]);

  // ---- autosave --------------------------------------------------------------
  const submittedRef = useRef(false);
  // Mirrors submittedRef for rendering: the page composer stays mounted until
  // the route change lands, and must not take a second submit meanwhile.
  const [submitted, setSubmitted] = useState(false);
  const autosaveInFlight = useRef<Promise<unknown> | null>(null);
  const [serverSave, setServerSave] = useState<{
    status: "idle" | "saving" | "saved" | "error";
    rev: number;
  }>({ status: "idle", rev: 0 });
  // The save waiting on the debounce timer. Unmounting (closing the modal,
  // leaving the page) or hiding the tab runs it instead of dropping the
  // last edits.
  const pendingSaveRef = useRef<(() => void) | null>(null);
  const draftAutosave = useMemo(
    () => (mode.kind === "draft" ? draftAutosavePayload(draft, accounts) : null),
    [mode.kind, draft, accounts],
  );
  const newFiles = hasNewFiles(draft);
  useEffect(() => {
    pendingSaveRef.current = null;
    if (rev === 0 || submittedRef.current) return;
    if (mode.kind === "new") {
      // Both slots hold other posts: nowhere to save until the person picks.
      if (older === "newer") return;
      // Don't overwrite an older unsent post: save next to it.
      const keepAside = older === "main";
      const saveLocal = () => {
        pendingSaveRef.current = null;
        if (submittedRef.current) return;
        if (keepAside) {
          saveLocalDraft(newerKey, draftRef.current);
          ownsNewerRef.current = true;
          return;
        }
        saveLocalDraft(scope, draftRef.current);
        if (ownsNewerRef.current) {
          clearLocalDraft(newerKey);
          ownsNewerRef.current = false;
        }
      };
      pendingSaveRef.current = saveLocal;
      const t = setTimeout(saveLocal, 500);
      return () => clearTimeout(t);
    }
    if (mode.kind !== "draft") return;
    // Existing draft: save everything but new files to the server.
    const payload = draftAutosave;
    if (!payload) return;
    const savingRev = rev;
    const postId = mode.postId;
    const accountIds = draft.accountIds;
    const saveToServer = async () => {
      pendingSaveRef.current = null;
      if (submittedRef.current) return;
      setServerSave({ status: "saving", rev: savingRev });
      try {
        const call = updateDraft(
          postId,
          payload.content,
          accountIds,
          payload.mediaIds,
          payload.metadata,
        );
        autosaveInFlight.current = call.catch(() => undefined);
        const r = await call;
        if (submittedRef.current) return;
        setServerSave({ status: r.success ? "saved" : "error", rev: savingRev });
        if (r.success) {
          // Every list that shows this draft's caption.
          for (const queryKey of [
            ["posts-page"],
            ["dashboard-home"],
            ["calendar-page"],
            ["post-detail", postId],
            ["command-palette"],
          ]) {
            void queryClient.invalidateQueries({ queryKey });
          }
        }
      } catch {
        if (!submittedRef.current) setServerSave({ status: "error", rev: savingRev });
      }
    };
    pendingSaveRef.current = () => void saveToServer();
    const t = setTimeout(() => void saveToServer(), 1500);
    return () => clearTimeout(t);
    // Runs per edit (rev); the values it reads are from that edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);
  useEffect(() => {
    const flush = () => pendingSaveRef.current?.();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  // Forget this post's local save (sent, or started over). An older post
  // kept aside stays saved.
  const clearOwnLocal = () => {
    pendingSaveRef.current = null;
    if (older === null) clearLocalDraft(scope);
    if (ownsNewerRef.current) {
      clearLocalDraft(newerKey);
      ownsNewerRef.current = false;
    }
  };
  const saveState: SaveState = (() => {
    if (mode.kind === "new") {
      if (older === "newer") return rev > 0 ? "pending" : "idle";
      return (rev > 0 || restoredLocal) && hasContent(draft) ? "local" : "idle";
    }
    if (mode.kind === "draft") {
      if (serverSave.status === "saving") return "saving";
      if (serverSave.rev === rev && serverSave.status === "error") return "error";
      // Autosave leaves new files out: they wait for an explicit save.
      if (newFiles) return "pending";
      if (serverSave.rev === rev && serverSave.status === "saved") return "saved";
    }
    return rev > 0 ? "pending" : "idle";
  })();

  // ---- leaving with unsaved work -----------------------------------------------
  // What leaving now would lose. A new post saves on this device and a draft
  // autosaves (a pending save runs on the way out), except new files, a
  // draft autosave can't store as it stands (no caption or account) and one
  // that failed. A scheduled post or "Post again" only saves on submit.
  const unsavedOnLeave =
    !submitted &&
    rev > 0 &&
    (mode.kind === "scheduled" ||
      mode.kind === "edit" ||
      (mode.kind === "draft" &&
        (newFiles ||
          !draftAutosave ||
          (serverSave.rev === rev && serverSave.status === "error"))));

  // ---- parts & media -----------------------------------------------------------
  const setPart = useCallback(
    (partId: string, fn: (p: ComposerPart) => ComposerPart) =>
      setDraft((d) => ({ ...d, parts: d.parts.map((p) => (p.id === partId ? fn(p) : p)) })),
    [setDraft],
  );

  const addFiles = useCallback(
    async (partId: string, files: File[]) => {
      if (files.length === 0) return;
      const { items, errors } = await intakeFiles(files);
      for (const e of errors) toast.error(e);
      if (items.length === 0) return;
      const current = draftRef.current;
      const part = current.parts.find((p) => p.id === partId);
      if (!part) {
        revokeMedia(items);
        return;
      }
      let add = items;
      if (current.parts.length > 1) {
        const room = Math.max(0, THREAD_MAX_MEDIA_PER_POST - part.media.length);
        if (add.length > room) {
          revokeMedia(add.slice(room));
          toast.error(
            `Each post in a thread takes up to ${THREAD_MAX_MEDIA_PER_POST} attachments. ${add.length - room} skipped.`,
          );
          add = add.slice(0, room);
        }
      }
      if (add.length === 0) return;
      setDraft((d) => ({
        ...d,
        parts: d.parts.map((p) => (p.id === partId ? { ...p, media: [...p.media, ...add] } : p)),
      }));
      for (const item of add) {
        void posterFor(item).then((posterUrl) => {
          if (!posterUrl) return;
          setDraft(
            (d) => ({
              ...d,
              parts: d.parts.map((p) => ({
                ...p,
                media: p.media.map((m) => (m.id === item.id ? { ...m, posterUrl } : m)),
              })),
            }),
            false,
          );
        });
      }
    },
    [setDraft],
  );

  // Files handed over by `openComposer({ files })` (Home quick-compose drop /
  // paste): attach once, through the same intake checks as the media button.
  const prefillFilesRef = useRef(mode.kind === "new" ? (props.prefill?.files ?? []) : []);
  useEffect(() => {
    const files = prefillFilesRef.current;
    if (files.length === 0) return;
    prefillFilesRef.current = [];
    const first = draftRef.current.parts[0];
    if (first) void addFiles(first.id, files);
  }, [addFiles]);

  const removeMedia = useCallback(
    (partId: string, mediaId: string) => {
      const gone = draftRef.current.parts
        .find((p) => p.id === partId)
        ?.media.filter((m) => m.id === mediaId);
      setPart(partId, (p) => ({ ...p, media: p.media.filter((m) => m.id !== mediaId) }));
      if (gone) revokeMedia(gone);
    },
    [setPart],
  );

  const moveMedia = useCallback(
    (partId: string, from: number, to: number) =>
      setPart(partId, (p) => {
        const next = [...p.media];
        const [item] = next.splice(from, 1);
        if (!item) return p;
        next.splice(to, 0, item);
        return { ...p, media: next };
      }),
    [setPart],
  );

  const cropForInstagram = useCallback(
    async (mediaId: string, ratio: number) => {
      const part = draft.parts[0];
      const item = part?.media.find((m) => m.id === mediaId);
      if (!part || !item) return;
      const cropped = await cropImage(item, ratio);
      if (!cropped) {
        toast.error("Couldn't crop that image here. Crop it in an editor and add it again.");
        return;
      }
      setPart(part.id, (p) => ({
        ...p,
        media: p.media.map((m) => (m.id === mediaId ? cropped : m)),
      }));
      toast.success(`Cropped to ${ratio === 1.91 ? "1.91:1" : "4:5"}. The crop is used on every network.`);
    },
    [draft.parts, setPart],
  );

  const addThreadPart = useCallback(() => {
    const first = draftRef.current.parts[0];
    const trim =
      draftRef.current.parts.length === 1 &&
      (first?.media.length ?? 0) > THREAD_MAX_MEDIA_PER_POST;
    if (trim && first) {
      revokeMedia(first.media.slice(THREAD_MAX_MEDIA_PER_POST));
      toast.message(
        `Thread posts take up to ${THREAD_MAX_MEDIA_PER_POST} attachments each. Kept the first ${THREAD_MAX_MEDIA_PER_POST}.`,
      );
    }
    setDraft((d) => {
      const parts = trim
        ? d.parts.map((p, i) => (i === 0 ? { ...p, media: p.media.slice(0, THREAD_MAX_MEDIA_PER_POST) } : p))
        : d.parts;
      return { ...d, parts: [...parts, { id: localId("p"), text: "", media: [] }] };
    });
  }, [setDraft]);

  const removeThreadPart = useCallback(
    (partId: string) => {
      const gone = draftRef.current.parts.find((p) => p.id === partId);
      setDraft((d) => ({ ...d, parts: d.parts.filter((p) => p.id !== partId) }));
      if (gone) revokeMedia(gone.media);
    },
    [setDraft],
  );

  const onPasteInto = useCallback(
    (partId: string, e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = clipboardFiles(e);
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(partId, files);
    },
    [addFiles],
  );

  // ---- popovers ----------------------------------------------------------------
  const [openSetting, setOpenSetting] = useState<SettingKey | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // "Best time" preset: only fetched once the schedule popover opens.
  const bestTimeHistory = useBestTimeHistory(
    scheduleOpen && signedIn && !isGuest && perms.canCreatePosts,
    basePath,
  );
  const bestTime = useMemo(
    () =>
      bestTimeHistory.data
        ? bestTimeFromPublications(bestTimeHistory.data, tz, new Date(now))
        : null,
    [bestTimeHistory.data, tz, now],
  );
  const [issuesOpen, setIssuesOpen] = useState(false);
  // The action that opened "Before you post", so "…to the other N" repeats it.
  const [issuesAction, setIssuesAction] = useState<Exclude<SubmitAction, "draft">>("now");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState(readPreviewPref);
  // Below lg the publish button sits in the header, in thumb reach above the
  // on-screen keyboard (which covers a bottom footer on iOS).
  const actionsInHeader = !useIsDesktop();
  // The modal closes itself; the page (full screen on phones) goes back.
  const onShellClose = props.onClose ?? props.onDone;
  const [mobilePreview, setMobilePreview] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const setPreviewPref = (collapsed: boolean) => {
    setPreviewCollapsed(collapsed);
    try {
      localStorage.setItem(PREVIEW_PREF_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  };

  // ---- submit --------------------------------------------------------------------
  const leave = () => {
    props.onDone();
  };

  const submit = (
      requested: SubmitAction,
      opts?: { onlyOk?: boolean; at?: Date; slotId?: string | null },
    ) => {
      // Already sent: the page composer can still be on screen while the
      // route change is pending (lazy route), so a second click or Cmd+Enter
      // must not save the post again.
      if (submittedRef.current) return;
      // No queue set up: "Add to queue" falls back to publishing now.
      const action: SubmitAction = requested === "queue" && !nextSlot ? "now" : requested;
      setAttempted(true);
      if (isGuest || !signedIn) {
        goToSignIn();
        return;
      }
      if (freeLimitBlocks(action)) {
        setIssuesOpen(false);
        openFreePostsLimit();
        return;
      }
      if (!(draft.parts[0]?.text ?? "").trim()) {
        toast.error(isThread ? "Add text to the first post." : "Add a caption.");
        textRef.current?.focus();
        return;
      }
      if (draft.accountIds.length === 0) {
        toast.error(action === "draft" ? "Pick at least one account before saving a draft." : "Pick at least one account to post to.");
        return;
      }
      let at: Date | null = null;
      let slotId: string | null = null;
      if (action === "schedule") {
        const when = opts?.at ?? pickedAt;
        if (!when) {
          setScheduleOpen(true);
          return;
        }
        if (isPast(when)) {
          toast.error("That time has passed. Pick a later one.");
          setScheduleOpen(true);
          return;
        }
        at = when;
        slotId = opts?.at ? (opts.slotId ?? null) : draft.queueSlotId;
      } else if (action === "queue" && nextSlot) {
        at = new Date(nextSlot.scheduledAt);
        // The slot is still being looked up again (a queued post that was
        // uploading just saved, or the list of held slots changed): wait for
        // it rather than book a slot another post already has.
        if (
          nextSlotQ.isPlaceholderData ||
          nextSlotQ.isFetching ||
          heldSlots.some((t) => new Date(t).getTime() === at!.getTime())
        ) {
          toast.message("Finding the next free queue slot. Try again in a moment.");
          return;
        }
        slotId = nextSlot.slotId;
      }
      // A fresh time from the popover replaces a stale "time has passed".
      const blocking = issuesFor(action, !!opts?.at);

      let targets = selected.filter((a) => !a.tokenExpired);
      if (action !== "draft") {
        if (opts?.onlyOk) {
          targets = selected.filter((a) => validation.okAccountIds.includes(a.id));
        } else if (blocking.length > 0) {
          setIssuesAction(action);
          setIssuesOpen(true);
          return;
        }
      }
      if (targets.length === 0) {
        toast.error("None of the selected accounts can take this post yet.");
        return;
      }

      submittedRef.current = true;
      setSubmitted(true);
      const snapshot: ComposerDraft = at
        ? { ...draft, scheduledAt: at.toISOString(), queueSlotId: slotId }
        : draft;
      const modeAtSubmit = mode;
      const reopen = () => {
        setPendingRestore(snapshot);
        if (modeAtSubmit.kind === "new") {
          navigate(dash("new"));
        } else {
          navigate(dash(`new?${modeAtSubmit.kind === "edit" ? "edit" : modeAtSubmit.kind}=${modeAtSubmit.postId}`));
        }
      };
      void runSubmit({
        action,
        mode,
        draft: snapshot,
        type,
        accounts: targets,
        scheduledAt: at,
        queueSlotId: slotId,
        scheduledLabel: at ? formatShortTime(at, tz, settings.use24h) : undefined,
        basePath,
        queryClient,
        posthog,
        reopen,
        // Let an autosave that is already on the wire land first, so it can't
        // turn a just-scheduled draft back into a draft.
        waitFor: autosaveInFlight.current,
      });
      // An older unsent post this composer kept aside stays saved.
      if (mode.kind === "new") clearOwnLocal();
      leave();
    };

  const onPrimary = () => {
    if (submittedRef.current) return;
    if (isGuest) {
      goToSignIn();
      return;
    }
    setAttempted(true);
    if (issuesFor(primaryAction).length > 0) {
      setIssuesAction(primaryAction);
      setIssuesOpen(true);
      return;
    }
    submit(primaryAction);
  };

  const applyFix = (issue: ComposerIssue, fix: ComposerFix) => {
    setIssuesOpen(false);
    if (fix.kind === "open-setting") setOpenSetting(fix.setting);
    else if (fix.kind === "add-media") fileInputRef.current?.click();
    else if (fix.kind === "deselect") {
      update((d) => ({ accountIds: d.accountIds.filter((id) => !issue.accountIds.includes(id)) }));
    } else if (fix.kind === "schedule") setScheduleOpen(true);
  };

  const onDeleteDraft = async () => {
    if (mode.kind !== "draft") return;
    setDeleting(true);
    try {
      const r = await deleteDraft(mode.postId);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      submittedRef.current = true;
      setConfirmDelete(false);
      toast.success("Draft deleted.");
      void queryClient.invalidateQueries();
      if (variant === "page") navigate(dash("posts?tab=drafts"), { replace: true });
      else props.onDone();
    } catch {
      toast.error("Couldn't delete the draft. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  const startFresh = () => {
    for (const p of draft.parts) revokeMedia(p.media);
    clearOwnLocal();
    // Keep what the composer was opened for (calendar slot, account).
    setState({ draft: freshDraft(props), restoredLocal: false });
    setRev(0);
    textRef.current?.focus();
  };

  // The older unsent post kept aside (see OlderSlot): open it instead, or
  // let this post take its place.
  const openOlderLocal = () => {
    if (older === null) return;
    const fromNewer = older === "newer";
    const saved = savedContent(fromNewer ? newerKey : scope);
    if (!saved) {
      // Already gone (discarded in another tab): keep this post and save it.
      setOlder(fromNewer && savedContent(scope) ? "main" : null);
      setRev((r) => r + 1);
      return;
    }
    // This post (never sent) is set aside for the one opened.
    if (fromNewer) {
      ownsNewerRef.current = true;
      setOlder(savedContent(scope) ? "main" : null);
    } else {
      if (ownsNewerRef.current) clearLocalDraft(newerKey);
      ownsNewerRef.current = false;
      setOlder(null);
    }
    for (const p of draft.parts) revokeMedia(p.media);
    setState({
      draft: { ...saved, scheduledAt: null, queueSlotId: null },
      restoredLocal: true,
    });
    setRev(0);
    textRef.current?.focus();
  };
  const discardOlderLocal = () => {
    if (older === "newer") {
      clearLocalDraft(newerKey);
      ownsNewerRef.current = false;
      setOlder(savedContent(scope) ? "main" : null);
    } else {
      clearLocalDraft(scope);
      setOlder(null);
    }
    // Save this post in the slot it now has.
    setRev((r) => r + 1);
  };

  // "Schedule post" from the command palette: open the picker once the
  // composer (and its split button) is on screen.
  const wantsSchedule = props.prefill?.intent === "schedule";
  const openedScheduleRef = useRef(false);
  const ready = loadState === "idle" && (!signedIn || perms.ready) && !(sessionPending && !session);
  useEffect(() => {
    if (!wantsSchedule || !ready || openedScheduleRef.current || isGuest) return;
    openedScheduleRef.current = true;
    setScheduleOpen(true);
  }, [wantsSchedule, ready, isGuest]);

  // Focus the caption on desktop (phones keep the keyboard down).
  useEffect(() => {
    if (!ready || wantsSchedule) return;
    if (!shouldAutoFocusOnMount()) return;
    const t = setTimeout(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 50);
    return () => clearTimeout(t);
  }, [ready, wantsSchedule]);

  // ---- labels ------------------------------------------------------------------------
  const short = (d: Date) => formatShortTime(d, tz, settings.use24h, new Date(now));
  // Neutral button ("Add to queue · 7:00 PM") until there is content to check.
  const issueCount = showIssues ? issuesFor(primaryAction).length : 0;
  // "Before you post" lists what blocks the action that opened it.
  const popoverIssues = issuesFor(issuesAction);
  const popoverGlobalBlocked = popoverIssues.some((i) => i.accountIds.length === 0);
  const issueSuffix = issueCount > 0 ? ` · ${issueCount} ${issueCount === 1 ? "issue" : "issues"}` : "";
  const primaryActionLabel = isGuest
    ? "Sign in to post"
    : primaryAction === "schedule"
      ? `${mode.kind === "scheduled" ? "Save" : "Schedule"} · ${short(pickedAt!)}`
      : primaryAction === "queue"
        ? `Add to queue · ${short(slotAt!)}`
        : "Publish now";

  const draftLabel = mode.kind === "scheduled" ? "Move to drafts" : "Save draft";
  const menu: SplitMenuItem[] = [
    {
      key: "now",
      label: "Publish now",
      shortcut: "mod+shift+enter",
      onSelect: () => submit("now"),
      disabled: freeLimitBlocks("now"),
      disabledReason: freeLimitBlocks("now") ? publishBlockedReason : null,
    },
    {
      key: "schedule",
      label: pickedAt ? "Change time…" : "Schedule…",
      hint: pickedAt ? short(pickedAt) : "Pick a date and time",
      onSelect: () => setScheduleOpen(true),
    },
    ...((pickedAt || (preferNow && queueOpen)) && slotAt
      ? [
          {
            key: "queue",
            label: `Add to queue · ${short(slotAt)}`,
            hint: "Use the next free slot instead",
            onSelect: () => {
              setPreferNow(false);
              if (pickedAt) update({ scheduledAt: null, queueSlotId: null });
            },
          },
        ]
      : []),
    ...(pickedAt
      ? [
          {
            key: "clear",
            label: "Clear time",
            hint: slotAt && !preferNow ? "Back to the queue" : "Back to publish now",
            onSelect: () => update({ scheduledAt: null, queueSlotId: null }),
          },
        ]
      : []),
    { key: "draft", label: draftLabel, onSelect: () => submit("draft") },
    ...(mode.kind === "draft"
      ? [
          {
            key: "delete",
            label: "Delete draft",
            tone: "danger" as const,
            onSelect: () => setConfirmDelete(true),
          },
        ]
      : []),
  ];

  const title =
    mode.kind === "draft"
      ? "Edit draft"
      : mode.kind === "scheduled"
        ? "Edit scheduled post"
        : mode.kind === "edit"
          ? "Post again"
          : "New post";

  // ---- gates ---------------------------------------------------------------------------
  if (submitted && variant === "page") {
    // Sent: hold this screen (no second submit) until the route change lands.
    return (
      <Shell variant={variant} title={title}>
        <div
          role="status"
          className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-text-muted"
        >
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
          <p>Your post is on its way. Its progress shows in the tray.</p>
          <Link href={dash()} className="font-medium text-accent hover:text-accent-hover">
            Back to Home
          </Link>
        </div>
      </Shell>
    );
  }
  if (signedIn && perms.ready && !perms.canCreatePosts) {
    return (
      <Shell variant={variant} title={title} onClose={onShellClose}>
        <EmptyState
          title="Publishing isn't part of your role"
          description="Ask a workspace admin to make you a Member or Admin to create posts."
          primaryAction={{ label: "Back to Home", href: dash() }}
          className="m-6"
        />
      </Shell>
    );
  }
  if (signedIn && layout.isError) {
    return (
      <Shell variant={variant} title={title} onClose={onShellClose}>
        <ErrorState
          message="Couldn't check your workspace role."
          detail="Check your connection, then try again."
          onRetry={() => void layout.refetch()}
          retrying={layout.isFetching}
          className="m-6"
        />
      </Shell>
    );
  }
  if (mode.kind !== "new" && loadState === "loading" && accountsError) {
    return (
      <Shell variant={variant} title={title} onClose={onShellClose}>
        <ErrorState
          message="Couldn't load your accounts."
          detail="The post opens once your accounts load. Check your connection, then try again."
          onRetry={() => void refetchAccounts()}
          className="m-6"
        />
      </Shell>
    );
  }
  if (
    loadState === "loading" ||
    (sessionPending && !session) ||
    (signedIn && !perms.ready && !isGuest)
  ) {
    return (
      <Shell variant={variant} title={title} onClose={onShellClose}>
        <div className="space-y-3 p-5" aria-busy aria-label="Loading post">
          <div className="h-8 w-2/3 animate-pulse rounded-full bg-bg-muted motion-reduce:animate-none" />
          <div className="h-36 animate-pulse rounded-xl bg-bg-muted motion-reduce:animate-none" />
          <div className="h-16 w-1/2 animate-pulse rounded-xl bg-bg-muted motion-reduce:animate-none" />
        </div>
      </Shell>
    );
  }
  if (loadState === "error") {
    return (
      <Shell variant={variant} title={title} onClose={onShellClose}>
        <ErrorState
          message="Couldn't open this post."
          detail={loadError ?? "Check your connection, then try again."}
          onRetry={() => {
            setLoadState("loading");
            setLoadNonce((n) => n + 1);
          }}
          className="m-6"
        />
        <p className="px-6 text-center text-sm text-text-muted">
          or{" "}
          <Link href={dash("new")} className="font-medium text-accent hover:text-accent-hover">
            start a new post
          </Link>
        </p>
      </Shell>
    );
  }

  const part0 = draft.parts[0]!;
  const threadLimit = isThread
    ? validation.networks.length
      ? Math.min(...validation.networks.map((n) => n.limit))
      : null
    : null;
  const warnings = validation.warnings;
  const videoDuration = draft.parts.flatMap((p) => p.media).find((m) => m.kind === "video")?.durationSec ?? null;
  const showRail = !previewCollapsed;

  const editor = (
    <div className="space-y-3">
      {restoredLocal && saveState === "local" && rev === 0 ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          Picked up your unsent post.
          <button type="button" onClick={startFresh} className="font-medium text-accent hover:text-accent-hover">
            Start fresh
          </button>
        </p>
      ) : null}
      {older ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          {older === "newer"
            ? "You have two earlier unsent posts saved on this device. This one isn't saved until you open or discard the latest."
            : "You have an earlier unsent post saved on this device."}
          <button type="button" onClick={openOlderLocal} className="font-medium text-accent hover:text-accent-hover">
            Open it instead
          </button>
          <button type="button" onClick={discardOlderLocal} className="font-medium text-text-muted hover:text-text">
            Discard it
          </button>
        </p>
      ) : null}

      {isGuest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-bg-subtle px-4 py-3">
          <p className="text-sm text-text">Sign in to connect accounts and post. You can write now.</p>
          <a
            href={signInUrl(typeof window !== "undefined" ? window.location.pathname + window.location.search : dash("new"))}
            className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            Sign in
          </a>
        </div>
      ) : (
        <AccountPicker
          accounts={accounts}
          selectedIds={draft.accountIds}
          onToggle={(id) =>
            update((d) => ({
              accountIds: d.accountIds.includes(id)
                ? d.accountIds.filter((x) => x !== id)
                : [...d.accountIds, id],
            }))
          }
          onSetSelection={(ids) => update({ accountIds: ids })}
          remember={remembered.remember}
          onRememberChange={(on) => remembered.setRememberAndSelection(on, new Set(draft.accountIds))}
          problems={problemsByAccount}
          loading={accountsLoading}
          error={accountsError}
          onRetry={() => void refetchAccounts()}
          tier={settings.tier}
          connectHref={dash("connections?connect=1")}
          canManageConnections={canManageConnections}
        />
      )}

      <div
        className={cn(
          "rounded-xl border bg-bg transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15",
          dragOver ? "border-accent ring-2 ring-accent/20" : "border-input",
        )}
      >
        <label htmlFor="composer-text" className="sr-only">
          {isThread ? "Post 1" : "Caption"}
        </label>
        <AutoResizeTextarea
          id="composer-text"
          ref={textRef}
          value={part0.text}
          onChange={(e) => {
            const text = e.target.value;
            setPart(part0.id, (p) => ({ ...p, text }));
          }}
          onPaste={(e) => onPasteInto(part0.id, e)}
          placeholder={isThread ? "Start your thread…" : "What do you want to share?"}
          rows={variant === "modal" ? 5 : 6}
          maxHeight={variant === "modal" ? 320 : 420}
          className="block min-h-32 w-full rounded-xl bg-transparent px-3.5 py-3 text-[15px] leading-relaxed text-text outline-none placeholder:text-text-muted"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isThread && part0.media.length >= THREAD_MAX_MEDIA_PER_POST}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text disabled:opacity-50 touch:h-11"
            >
              <ImagePlus className="size-4" aria-hidden />
              Media
            </button>
            {!isThread ? (
              <button
                type="button"
                onClick={addThreadPart}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text touch:h-11"
              >
                <ListPlus className="size-4" aria-hidden />
                Make it a thread
              </button>
            ) : null}
          </div>
          <span className="pr-1 text-xs tabular-nums text-text-muted" aria-live="polite">
            {part0.text.length > 0 ? `${part0.text.length.toLocaleString()} character${part0.text.length === 1 ? "" : "s"}` : null}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void addFiles(part0.id, files);
          }}
        />
      </div>

      <NetworkStrip
        networks={validation.networks}
        showProblems={showIssues}
        overrides={draft.captionOverrides}
        mainText={part0.text}
        allowOverrides={!isThread}
        onStartOverride={(network) =>
          update((d) => ({ captionOverrides: { ...d.captionOverrides, [network]: d.parts[0]?.text ?? "" } }))
        }
        onChangeOverride={(network, text) =>
          update((d) => ({ captionOverrides: { ...d.captionOverrides, [network]: text } }))
        }
        onClearOverride={(network) =>
          update((d) => {
            const next = { ...d.captionOverrides };
            delete next[network];
            return {
              captionOverrides: next,
              accountCaptions: withoutNetworkCaptions(d.accountCaptions, accounts, network),
            };
          })
        }
        accountCaptions={draft.accountCaptions}
        onChangeAccountCaption={(accountId, text) =>
          update((d) => ({ accountCaptions: { ...d.accountCaptions, [accountId]: text } }))
        }
        onUseOneCaption={(network) =>
          update((d) => {
            const first = accounts.find(
              (a) => a.platform === network && d.accountIds.includes(a.id),
            );
            const caption =
              (first ? d.accountCaptions?.[first.id] : undefined) ??
              d.captionOverrides[network] ??
              d.parts[0]?.text ??
              "";
            return {
              captionOverrides: { ...d.captionOverrides, [network]: caption },
              accountCaptions: withoutNetworkCaptions(d.accountCaptions, accounts, network),
            };
          })
        }
      />

      {part0.media.length > 0 ? (
        <MediaTray
          media={part0.media}
          onAddFiles={(files) => void addFiles(part0.id, files)}
          onRemove={(id) => removeMedia(part0.id, id)}
          onMove={(from, to) => moveMedia(part0.id, from, to)}
          onCropForInstagram={
            selected.some((a) => a.platform === "instagram") && !isThread
              ? (id, ratio) => void cropForInstagram(id, ratio)
              : undefined
          }
          max={isThread ? THREAD_MAX_MEDIA_PER_POST : undefined}
          label={isThread ? "Media for post 1" : "Media"}
        />
      ) : null}

      {isThread ? (
        <ThreadEditor
          parts={draft.parts}
          limit={threadLimit}
          onChangeText={(id, text) => setPart(id, (p) => ({ ...p, text }))}
          onAddFiles={(id, files) => void addFiles(id, files)}
          onRemoveMedia={removeMedia}
          onMoveMedia={moveMedia}
          onRemovePart={removeThreadPart}
          onAddPart={addThreadPart}
          onPaste={onPasteInto}
        />
      ) : null}

      <SettingsPills
        draft={draft}
        update={update}
        selected={selected}
        type={type}
        allowAutoPlug={settings.allowAutoPlug}
        allowAutoRepost={settings.allowAutoRepost}
        use24h={settings.use24h}
        billingHref={dash("billing")}
        open={openSetting}
        onOpenChange={setOpenSetting}
        needsAttention={settingsNeedingAttention}
        rememberAutomations={autoRemember.remember}
        onRememberAutomationsChange={autoRemember.setRemember}
        onTikTokMaxDuration={(id, seconds) =>
          setTiktokMaxDuration((m) => (m[id] === seconds ? m : { ...m, [id]: seconds }))
        }
        videoDurationSec={videoDuration}
      />

      {warnings.length > 0 ? (
        <ul className="space-y-1" aria-label="Notes">
          {warnings.map((w) => (
            <li key={w.id} className="flex items-start gap-2 text-xs text-text-muted">
              {w.tone === "info" ? (
                <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              )}
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  const rail = (
    <PreviewRail
      draft={draft}
      selected={selected}
      type={type}
      networks={validation.networks}
      issues={visibleIssues}
      targetAt={pickedAt ?? (primaryAction === "queue" ? slotAt : null)}
      timezone={tz}
      use24h={settings.use24h}
      onCollapse={() => setPreviewPref(true)}
      onPostWithout={(network) =>
        update((d) => ({
          accountIds: d.accountIds.filter((id) => accounts.find((a) => a.id === id)?.platform !== network),
        }))
      }
    />
  );

  const savedPill = (() => {
    if (isGuest) return null;
    const map: Record<SaveState, { text: string; cls: string; title: string } | null> = {
      idle: null,
      local: { text: "Saved", cls: "text-text-muted", title: "Saved on this device. It'll be here when you come back." },
      saved: { text: "Saved", cls: "text-text-muted", title: "Draft saved" },
      saving: { text: "Saving…", cls: "text-text-muted", title: "Saving draft" },
      error: { text: "Not saved", cls: "text-danger", title: "Couldn't save the draft. Use Save draft to try again." },
      pending:
        mode.kind === "draft"
          ? {
              text: "Unsaved",
              cls: "text-text-muted",
              title: newFiles
                ? "New media is uploaded when you use Save draft. Everything else saves as you type."
                : draftAutosave
                  ? "Saving in a moment."
                  : "Not saved yet. A draft saves once it has a caption and an account.",
            }
          : { text: "Unsaved changes", cls: "text-text-muted", title: "Changes are saved when you submit." },
    };
    const v = map[saveState];
    if (!v) return null;
    return (
      <span className={cn("shrink-0 whitespace-nowrap text-xs", v.cls)} title={v.title} aria-live="polite">
        {v.text}
      </span>
    );
  })();

  const primaryControl = isGuest ? (
    <a
      href={signInUrl(typeof window !== "undefined" ? window.location.pathname + window.location.search : dash("new"))}
      className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover touch:h-11"
    >
      Sign in to post
    </a>
  ) : (
    <SplitButton
      ref={splitRef}
      label={
        <>
          {primaryActionLabel}
          {/* Header room is tight on phones: the amber button already says
              "fix first", so the count is for screen readers there. */}
          {issueSuffix ? <span className={cn(actionsInHeader && "sr-only")}>{issueSuffix}</span> : null}
        </>
      }
      onPrimary={onPrimary}
      title={`${primaryAction === "queue" ? "Add to queue" : primaryAction === "schedule" ? "Schedule" : "Publish"} (${shortcutLabel("mod+enter")})`}
      menu={menu}
      warn={issueCount > 0}
    />
  );

  return (
    <Shell
      variant={variant}
      title={title}
      onClose={onShellClose}
      headerExtra={savedPill}
      headerActions={
        <>
          {variant === "page" && mode.kind === "new" ? (
            <Link
              href={dash("bulk-tools")}
              className="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-text-muted hover:bg-bg-muted hover:text-text sm:inline-flex"
            >
              <Upload className="size-3.5" aria-hidden />
              Bulk upload
            </Link>
          ) : null}
          {variant === "modal" && props.onExpand ? (
            <button
              type="button"
              onClick={() => {
                // Save first, so the full page goes on saving to the same slot.
                pendingSaveRef.current?.();
                props.onExpand?.(draft, { keepsOlder: older !== null, ownsNewer: ownsNewerRef.current });
              }}
              aria-label="Open full page"
              title="Open full page"
              className="inline-flex size-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-muted hover:text-text touch:size-11"
            >
              <Expand className="size-4" aria-hidden />
            </button>
          ) : null}
          {actionsInHeader ? primaryControl : null}
        </>
      }
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onKeyDown={(e) => {
          // A field that already handled Enter (the schedule "Type a time" input)
          // owns it: submitting again here would create the post twice.
          if (e.defaultPrevented || e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
          e.preventDefault();
          if (e.shiftKey) submit("now");
          else onPrimary();
        }}
        onDragEnter={(e) => {
          if (hasFiles(e)) setDragOver(true);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragOver(false);
          void addFiles(part0.id, Array.from(e.dataTransfer.files));
        }}
      >
        <div
          className={cn(
            "grid min-h-0 flex-1",
            showRail ? "lg:grid-cols-[minmax(0,1fr)_330px]" : "lg:grid-cols-1",
          )}
        >
          <div
            data-popover-boundary
            className={cn(
              "min-h-0 px-4 py-4 sm:px-5",
              variant === "modal" || actionsInHeader
                ? "overflow-y-auto overscroll-contain"
                : "lg:overflow-y-auto lg:overscroll-contain",
            )}
          >
            {editor}
            {mobilePreview ? <div className="mt-4 border-t border-border pt-4 lg:hidden">{rail}</div> : null}
          </div>
          {showRail ? (
            <aside
              className="hidden min-h-0 border-l border-border bg-bg-subtle px-3.5 py-4 lg:flex lg:flex-col"
              aria-label="Preview"
            >
              {rail}
            </aside>
          ) : null}
        </div>
        {dragOver ? (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/5 text-sm font-medium text-accent">
            Drop images or videos to add them
          </div>
        ) : null}

        <footer
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 border-t border-border bg-bg-elevated px-4 py-3 sm:px-5",
            // Full screen (modal, or the page on phones): clear the gesture bar.
            variant === "modal" || actionsInHeader
              ? "pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
              : "rounded-b-2xl",
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            {settings.freePostsRemaining != null && !isGuest ? (
              <span className={cn(settings.freePostsRemaining <= 0 && "text-warning")}>
                {settings.freePostsRemaining}/{getPlanLimits("free").maxFreePosts} free posts left
                {settings.freePostsRemaining <= 0 ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={openFreePostsLimit}
                      className="font-medium text-accent hover:text-accent-hover"
                    >
                      Upgrade
                    </button>
                  </>
                ) : null}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setMobilePreview((v) => !v)}
              className="inline-flex items-center gap-1 font-medium text-text-muted hover:text-text lg:hidden"
              aria-expanded={mobilePreview}
            >
              {mobilePreview ? "Hide preview" : "Preview"}
            </button>
            {previewCollapsed ? (
              <button
                type="button"
                onClick={() => setPreviewPref(false)}
                className="hidden items-center gap-1 font-medium text-text-muted hover:text-text lg:inline-flex"
              >
                <PanelRightOpen className="size-3.5" aria-hidden />
                Show preview
              </button>
            ) : null}
          </div>
          <div className="ml-auto flex min-w-0 max-w-full items-center gap-2">
            {!isGuest ? (
              // Phones: the caret menu already has Save draft.
              <button
                type="button"
                onClick={() => submit("draft")}
                className="hidden h-9 shrink-0 items-center whitespace-nowrap rounded-xl border border-border bg-bg-elevated px-3 text-sm font-medium text-text transition-colors sm:inline-flex hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
              >
                {draftLabel}
              </button>
            ) : null}
            {actionsInHeader ? null : primaryControl}
          </div>
        </footer>

        <Popover
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          anchorRef={splitRef}
          title="Schedule"
          side="top"
          align="end"
          width={460}
        >
          <SchedulePanel
            value={draft.scheduledAt}
            valueSlotId={draft.queueSlotId}
            timezone={tz}
            defaultTimezone={settings.timezone}
            onTimezoneChange={(z) => update({ timezoneOverride: z })}
            use24h={settings.use24h}
            dateFormat={settings.dateFormat}
            nextSlot={nextSlot}
            bestTime={bestTime}
            onPick={(at, slotId) => update({ scheduledAt: at.toISOString(), queueSlotId: slotId })}
            onSchedule={(at, slotId) => {
              update({ scheduledAt: at.toISOString(), queueSlotId: slotId });
              setScheduleOpen(false);
              submit("schedule", { at, slotId });
            }}
            onPublishNow={() => {
              setScheduleOpen(false);
              submit("now");
            }}
            onSaveDraft={() => {
              setScheduleOpen(false);
              submit("draft");
            }}
            canPublish={!freeLimitBlocks("now")}
            publishDisabledReason={freeLimitBlocks("now") ? publishBlockedReason : null}
            canSchedule={!freeLimitBlocks("schedule")}
            scheduleDisabledReason={freeLimitBlocks("schedule") ? publishBlockedReason : null}
            scheduleQueueHref={dash("settings/schedule")}
            settingsHref={dash("settings/general")}
            submitLabel={mode.kind === "scheduled" ? "Save" : "Schedule"}
          />
        </Popover>

        <Popover
          open={issuesOpen}
          onClose={() => setIssuesOpen(false)}
          anchorRef={splitRef}
          title="Before you post"
          side="top"
          align="end"
          width={380}
        >
          <div className="space-y-3">
            <p className="text-sm font-semibold text-text">
              {popoverIssues.length === 1 ? "1 thing to fix" : `${popoverIssues.length} things to fix`}
            </p>
            <ul className="space-y-2">
              {popoverIssues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-2 text-xs text-text">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1">
                    {issue.message}
                    {issue.fix ? (
                      <span className="mt-1 block">
                        {issue.fix.kind === "reconnect" ? (
                          <a href={issue.fix.href} className="font-medium text-accent hover:text-accent-hover">
                            {issue.fix.label}
                          </a>
                        ) : issue.fix.kind === "upgrade" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setIssuesOpen(false);
                              openFreePostsLimit();
                            }}
                            className="font-medium text-accent hover:text-accent-hover"
                          >
                            {issue.fix.label}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => applyFix(issue, issue.fix!)}
                            className="font-medium text-accent hover:text-accent-hover"
                          >
                            {issue.fix.label}
                          </button>
                        )}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {!popoverGlobalBlocked && okCount > 0 && okCount < selected.length ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-xs text-text-muted">
                  {okCount} of {selected.length} accounts are ready.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIssuesOpen(false);
                    submit(issuesAction, { onlyOk: true });
                  }}
                  className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
                >
                  {issuesAction === "now" ? "Publish" : issuesAction === "queue" ? "Queue" : "Schedule"} to the other {okCount}
                </button>
              </div>
            ) : null}
          </div>
        </Popover>
      </div>

      <Dialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>It&apos;s removed for everyone in this workspace. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium text-text hover:bg-bg-muted"
            >
              Keep draft
            </button>
            <button
              type="button"
              onClick={() => void onDeleteDraft()}
              disabled={deleting}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-60"
            >
              {deleting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Delete draft
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {mode.kind !== "new" ? (
        <LeaveGuard
          unsaved={unsavedOnLeave}
          sentRef={submittedRef}
          message={
            mode.kind === "draft" && newFiles
              ? "The media you added isn't saved yet. Use Save draft to keep it."
              : mode.kind === "scheduled"
                ? "Your changes to this scheduled post aren't saved. Use Save to keep them."
                : "Your changes aren't saved."
          }
          discardLabel={mode.kind === "draft" && newFiles ? "Discard new media" : "Discard changes"}
        />
      ) : null}
      {limitModal}
    </Shell>
  );
}

/**
 * Asks before unsaved changes are dropped: in-app navigation (the ✕, which
 * goes back on the page, the sidebar, browser back) gets a dialog, closing
 * the tab or reloading gets the browser's prompt. Mounted only by a composer
 * editing an existing post: a router runs one blocker at a time.
 */
function LeaveGuard({
  unsaved,
  sentRef,
  message,
  discardLabel,
}: {
  unsaved: boolean;
  /** Set once the post is sent or deleted: the composer leaves on its own. */
  sentRef: RefObject<boolean>;
  message: string;
  discardLabel: string;
}) {
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      unsaved &&
      !sentRef.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
    [unsaved, sentRef],
  );
  const blocker = useBlocker(shouldBlock);
  // Nothing left to lose any more (a save landed meanwhile): go on.
  useEffect(() => {
    if (blocker.state === "blocked" && !unsaved) blocker.proceed();
  }, [blocker, unsaved]);
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  return (
    <Dialog
      open={blocker.state === "blocked"}
      onOpenChange={(o) => {
        if (!o) blocker.reset?.();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => blocker.proceed?.()}
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium text-text hover:bg-bg-muted"
          >
            {discardLabel}
          </button>
          <button
            type="button"
            onClick={() => blocker.reset?.()}
            className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
          >
            Keep editing
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Shell({
  variant,
  title,
  onClose,
  headerExtra,
  headerActions,
  children,
}: {
  variant: "page" | "modal";
  title: string;
  onClose?: () => void;
  headerExtra?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const Heading = variant === "modal" ? "h2" : "h1";
  // Below lg the publish button moves into this header (mock 17·A: ✕ on the
  // left, the split button on the right), and the page composer becomes a
  // full-screen sheet over the app chrome; the layout hides the mobile top
  // bar and tab bar on composer routes.
  const compact = !useIsDesktop();
  const fullScreen = variant === "page" && compact;
  const closeButton =
    (variant === "modal" || fullScreen) && onClose ? (
      <button
        type="button"
        onClick={onClose}
        aria-label="Close composer"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:size-11"
      >
        <X className="size-4" aria-hidden />
      </button>
    ) : null;
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-bg-elevated text-text",
        variant === "modal"
          ? "h-full"
          : fullScreen
            ? "fixed inset-0 z-50 overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
            : "rounded-2xl border border-border shadow-sm lg:h-[calc(100dvh-4rem)] lg:min-h-[560px] lg:overflow-hidden",
      )}
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3 sm:px-5",
          compact && "pl-2 sm:pl-3",
          fullScreen && "pt-[calc(env(safe-area-inset-top)+0.75rem)]",
        )}
      >
        {compact ? closeButton : null}
        <Heading
          className={cn(
            "whitespace-nowrap text-base font-semibold tracking-tight text-text",
            // Phones: the ✕ and the publish button need the row.
            compact && "max-sm:sr-only",
          )}
          id="composer-title"
        >
          {title}
        </Heading>
        {headerExtra}
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {headerActions}
          {compact ? null : closeButton}
        </div>
      </header>
      {children}
    </div>
  );
}

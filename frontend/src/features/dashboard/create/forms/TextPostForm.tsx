import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { usePostHog } from "@posthog/react";
import { capturePostLifecycle } from "@/lib/posthog-events";
import {
  freePublishBlockReason,
  getComposerSubmitBlockReason,
  getFreePostsRemaining,
  isFreePublishBlocked,
} from "@/lib/free-tier-publish";
import { signInUrl } from "@/lib/sign-in-url";
import {
  createPost,
  getDraft,
  getScheduledPost,
  getPostToEdit,
  deleteDraft,
  updateDraft,
  updateAndPublish,
  updatePost,
  type PublishMode,
} from "@/api/posts";
import { getPostPublicationList } from "@/api/publish";
import {
  sortBySlowPlatformsLast,
  publishPostWithParallelProgress,
} from "@/lib/publish-order";
import { createAutoPlug, createResurfaceSchedule } from "@/api/resurface";
import {
  useRememberedAccounts,
  useApplyRememberedSelectionWhenReady,
  REMEMBERED_ACCOUNT_KEYS,
} from "@/lib/remembered-accounts";
import { useRememberedAutoRepostAutoPlug } from "@/lib/remembered-autorepost-autoplug";
import { PostFormOptions } from "../PostFormOptions";
import { SchedulePostSidebar } from "../SchedulePostSidebar";
import { SwitchPostTypeLinks } from "../SwitchPostTypeLinks";
import { getResurfacePlatforms } from "@/lib/resurface-utils";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type {
  AutoPlugConfig,
  ConnectedAccount,
} from "@/components/autoplug/AutoPlugPanel";
import { AutoResurfaceSettingsModal } from "@/components/repost/AutoResurfaceSettingsModal";
import { AutoPlugSettingsModal } from "@/components/autoplug/AutoPlugSettingsModal";
import { applyBulkAutoFeaturesToScheduledMetadata } from "@/lib/bulk-auto-features-metadata";
import { PLATFORMS } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { AccountAvatar } from "@/components/AccountAvatar";
import {
  UploadPublishOverlay,
  type PlatformResult,
  type PlatformStatus,
} from "@/components/UploadPublishOverlay";
import {
  consumeComposerPayload,
  clearComposerPayload,
} from "@/lib/composer-bridge";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { AutoResizeTextarea } from "@/components/ui/AutoResizeTextarea";
import { CaptionCounter } from "@/components/caption-counter";
import {
  XPostSettingsInline,
  type XPostSettings,
} from "@/components/XPostSettingsInline";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Check, Circle } from "lucide-react";

const TWITTER_THREAD_SEP = "---";

type AccountCaptionState = {
  overridden: boolean;
  value: string;
};

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  isTwitterPremium?: boolean;
  tokenExpired?: boolean;
};

export function TextPostForm({
  accounts,
  accountsLoading = false,
  use24HourTimeFormat = false,
  dateFormat = "dd/MM/yyyy",
  timezone = null,
  draftId: initialDraftId,
  scheduledId: initialScheduledId,
  editId: initialEditId,
  allowAutoRepost = true,
  allowAutoPlug = true,
  supportedPlatforms,
  subscriptionTier = "free",
  freePostsUsed = 0,
  isGuest = false,
}: {
  accounts: Account[];
  accountsLoading?: boolean;
  use24HourTimeFormat?: boolean;
  dateFormat?: string | null;
  timezone?: string | null;
  draftId?: string;
  scheduledId?: string;
  editId?: string;
  allowAutoRepost?: boolean;
  allowAutoPlug?: boolean;
  supportedPlatforms?: string[];
  subscriptionTier?: "free" | "starter" | "growth" | "pro";
  freePostsUsed?: number;
  isGuest?: boolean;
}) {
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const invalidateQueries = useInvalidateQueries();
  const posthog = usePostHog();
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const intendedQueueSlotIdRef = useRef<string | null>(null);
  const [content, setContent] = useState("");
  const {
    remember,
    setRememberAndSelection,
    getInitialSelectedIds,
    persistSelection,
  } = useRememberedAccounts(REMEMBERED_ACCOUNT_KEYS.textPost);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (initialDraftId || initialScheduledId || initialEditId) return new Set();
    const validIds = new Set(
      accounts.filter((a) => !a.tokenExpired).map((a) => a.id),
    );
    return getInitialSelectedIds(validIds);
  });
  const [mode, setMode] = useState<PublishMode>("now");
  const modeRef = useRef(mode);
  // eslint-disable-next-line react-hooks/refs
  modeRef.current = mode;
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(
    !!(initialDraftId || initialScheduledId || initialEditId),
  );
  type OverlayPhase = "idle" | "publishing" | "saving" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [platformStatuses, setPlatformStatuses] = useState<PlatformResult[]>(
    [],
  );
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [scheduledPostId, setScheduledPostId] = useState<string | null>(null);
  const [draftSavedPostId, setDraftSavedPostId] = useState<string | null>(null);
  const [xPostSettings, setXPostSettings] = useState<XPostSettings>({
    madeWithAi: false,
    paidPartnership: false,
  });
  const [resurfaceConfig, setResurfaceConfig] =
    useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );
  const [resurfaceModalOpen, setResurfaceModalOpen] = useState(false);
  const [autoplugModalOpen, setAutoplugModalOpen] = useState(false);
  const configBeforeResurfaceRef = useRef<AutoResurfaceConfig | null>(null);
  const configBeforeAutoPlugRef = useRef<AutoPlugConfig | null>(null);
  const hasRestoredAutoFeaturesRef = useRef(false);
  const {
    remember: rememberAutoFeatures,
    setRemember: setRememberAutoFeatures,
    getInitialState: getAutoFeaturesInitialState,
    persistAutoRepost,
    persistAutoPlug,
  } = useRememberedAutoRepostAutoPlug();
  const [showContentError, setShowContentError] = useState(false);
  type ConfigPanel = "platform-captions" | "x" | null;
  const [activeConfigPanel, setActiveConfigPanel] = useState<ConfigPanel>(null);
  const [accountCaptionsState, setAccountCaptionsState] = useState<
    Record<string, AccountCaptionState>
  >({});
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (!e.ctrlKey && !e.metaKey)) return;
      const form = formRef.current;
      if (!form || !form.contains(e.target as Node)) return;
      e.preventDefault();
      // Cmd/Ctrl+Enter: align with sidebar buttons (otherwise intendedModeRef is null).
      intendedModeRef.current = modeRef.current;
      form.requestSubmit();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!initialDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getDraft(initialDraftId);
        if (cancelled) return;
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        const { draft } = result;
        const validAccountIds = new Set(
          accounts.filter((a) => !a.tokenExpired).map((a) => a.id),
        );
        const restoredIds = draft.connectedAccountIds.filter((id) =>
          validAccountIds.has(id),
        );
        setContent(draft.originalContent ?? "");
        setSelectedIds(new Set(restoredIds));
        setScheduledAt(draft.scheduledAt ? new Date(draft.scheduledAt) : null);
        const draftMeta = draft.metadata as Record<string, unknown> | null;
        if (draftMeta?.x && typeof draftMeta.x === "object") {
          const x = draftMeta.x as Record<string, unknown>;
          setXPostSettings({
            madeWithAi: x.madeWithAi === true,
            paidPartnership: x.paidPartnership === true,
          });
        } else {
          setXPostSettings({ madeWithAi: false, paidPartnership: false });
        }
        if (draft.scheduledAt) setMode("scheduled");
      } catch {
        if (!cancelled) toast.error("Failed to load draft");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId, accounts]);

  useEffect(() => {
    if (!initialScheduledId || initialDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getScheduledPost(initialScheduledId);
        if (cancelled) return;
        if (!result.success) {
          toast.error(result.error);
          setDraftLoading(false);
          return;
        }
        const { post: scheduled } = result;
        const validAccountIds = new Set(
          accounts.filter((a) => !a.tokenExpired).map((a) => a.id),
        );
        const restoredIds = scheduled.connectedAccountIds.filter((id) =>
          validAccountIds.has(id),
        );
        setContent(scheduled.originalContent ?? "");
        setSelectedIds(new Set(restoredIds));
        setScheduledAt(
          scheduled.scheduledAt ? new Date(scheduled.scheduledAt) : null,
        );
        const scheduledMeta = scheduled.metadata as Record<
          string,
          unknown
        > | null;
        if (scheduledMeta?.x && typeof scheduledMeta.x === "object") {
          const x = scheduledMeta.x as Record<string, unknown>;
          setXPostSettings({
            madeWithAi: x.madeWithAi === true,
            paidPartnership: x.paidPartnership === true,
          });
        } else {
          setXPostSettings({ madeWithAi: false, paidPartnership: false });
        }
        setMode("scheduled");
        if (scheduled.queueSlotId)
          intendedQueueSlotIdRef.current = scheduled.queueSlotId;
      } catch {
        if (!cancelled) toast.error("Failed to load post");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialScheduledId, initialDraftId, accounts]);

  useEffect(() => {
    if (!initialEditId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getPostToEdit(initialEditId);
        if (cancelled) return;
        if (!result.success) {
          toast.error(result.error);
          setDraftLoading(false);
          return;
        }
        const { post: toEdit } = result;
        const validAccountIds = new Set(
          accounts.filter((a) => !a.tokenExpired).map((a) => a.id),
        );
        const restoredIds = toEdit.connectedAccountIds.filter((id) =>
          validAccountIds.has(id),
        );
        setContent(toEdit.originalContent ?? "");
        setSelectedIds(new Set(restoredIds));
        const editMeta = toEdit.metadata as Record<string, unknown> | null;
        if (editMeta?.x && typeof editMeta.x === "object") {
          const x = editMeta.x as Record<string, unknown>;
          setXPostSettings({
            madeWithAi: x.madeWithAi === true,
            paidPartnership: x.paidPartnership === true,
          });
        } else {
          setXPostSettings({ madeWithAi: false, paidPartnership: false });
        }
      } catch {
        if (!cancelled) toast.error("Failed to load post");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEditId, accounts]);

  useEffect(() => {
    if (initialDraftId || initialScheduledId || initialEditId) return;
    if (searchParams.get("fromComposer") !== "1") return;
    const payload = consumeComposerPayload();
    if (!payload) return;
    if (payload.text) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContent((prev) => (prev ? prev : payload.text));
    }
    return () => {
      setTimeout(clearComposerPayload, 100);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftId, initialEditId, searchParams]);

  const { isHydrated } = useApplyRememberedSelectionWhenReady({
    skip: !!(initialDraftId || initialScheduledId || initialEditId),
    accountsLoading,
    accounts,
    getInitialSelectedIds,
    setSelectedIds,
  });

  useEffect(() => {
    if (!isHydrated) return;
    if (remember) persistSelection(selectedIds);
  }, [isHydrated, remember, selectedIds, persistSelection]);

  const handleRememberChange = useCallback(
    (checked: boolean) => {
      setRememberAndSelection(checked, selectedIds);
    },
    [setRememberAndSelection, selectedIds],
  );

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const hasXSelected = selectedAccounts.some((a) => a.platform === "twitter_x");
  const previewAccount =
    selectedAccounts.length > 0
      ? selectedAccounts[selectedAccounts.length - 1]
      : null;
  const selectedAccountIds = Array.from(selectedIds);
  const showCustomCaptionsSection = selectedIds.size >= 2;
  const platformDisplayName = (platformId: string) =>
    PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;
  const hasXForResurface =
    getResurfacePlatforms(selectedAccountIds, accounts).length > 0;
  const resurfaceVisible = hasXForResurface;
  const autoPlugVisible = hasXForResurface;

  // Restore Auto-Repost & Auto-Plug from localStorage when Twitter is selected
  useEffect(() => {
    if (!hasXForResurface) {
      hasRestoredAutoFeaturesRef.current = false;
      return;
    }
    if (!rememberAutoFeatures) return;
    if (hasRestoredAutoFeaturesRef.current) return;
    const { autoRepostConfig, autoPlugConfig } = getAutoFeaturesInitialState();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoRepostConfig) setResurfaceConfig(autoRepostConfig);
    if (autoPlugConfig) setAutoPlugConfig(autoPlugConfig);
    hasRestoredAutoFeaturesRef.current = true;
  }, [hasXForResurface, rememberAutoFeatures, getAutoFeaturesInitialState]);

  // Persist Auto-Repost & Auto-Plug when remember is on
  useEffect(() => {
    if (!rememberAutoFeatures || !hasXForResurface) return;
    persistAutoRepost(!!resurfaceConfig, resurfaceConfig);
    persistAutoPlug(!!autoPlugConfig, autoPlugConfig);
  }, [
    rememberAutoFeatures,
    hasXForResurface,
    resurfaceConfig,
    autoPlugConfig,
    persistAutoRepost,
    persistAutoPlug,
  ]);

  const hasTwitter = selectedAccounts.some((a) => a.platform === "twitter_x");
  const isThread = content.includes(TWITTER_THREAD_SEP);
  const threadParts = isThread
    ? content
        .split(TWITTER_THREAD_SEP)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  const twitterThreadWarning = hasTwitter && isThread && threadParts.length > 1;

  const setupAutoPlug = async (postId: string) => {
    if (!autoPlugConfig) return true;
    const xAccount = selectedAccounts.find((a) => a.platform === "twitter_x");
    // Stale config can linger (e.g. remembered settings) after X is deselected
    if (!xAccount) return true;
    const autoPlugResult = await createAutoPlug(
      postId,
      xAccount?.id ?? null,
      autoPlugConfig,
    );
    if (!autoPlugResult.success) {
      toast.error(autoPlugResult.error);
      return false;
    }
    return true;
  };

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const selectAll = () => {
    if (selectableAccounts.every((a) => selectedIds.has(a.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableAccounts.map((a) => a.id)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.dismiss();
    if (isGuest) {
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = signInUrl(
        window.location.pathname + window.location.search,
      );
      return;
    }
    if (!content.trim()) {
      setShowContentError(true);
      return;
    }
    setShowContentError(false);
    const effectiveModeEarly = intendedModeRef.current ?? mode;
    const gateReason = getComposerSubmitBlockReason({
      action: effectiveModeEarly,
      selectedAccountCount: selectedIds.size,
      subscriptionTier,
      freePostsUsed,
    });
    if (gateReason) {
      toast.error(gateReason);
      return;
    }
    setScheduledPostId(null);
    setDraftSavedPostId(null);
    if ((intendedModeRef.current ?? mode) === "scheduled") {
      if (!scheduledAt) {
        toast.error("Please select a date and time.");
        return;
      }
      if (scheduledAt <= new Date()) {
        toast.error("Scheduled time must be in the future.");
        return;
      }
    }
    setLoading(true);
    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;
    if (effectiveMode === "now") setOverlayPhase("publishing");
    if (effectiveMode === "draft") setOverlayPhase("saving");
    if (effectiveMode === "scheduled") setOverlayPhase("publishing");
    const accountIds = Array.from(selectedIds);
    const accountCaptions: Record<string, string> = {};
    for (const account of selectedAccounts) {
      const captionState = accountCaptionsState[account.id] ?? {
        overridden: false,
        value: "",
      };
      if (captionState.overridden) {
        accountCaptions[account.id] = captionState.value.trim();
      }
    }
    const metadata: Record<string, unknown> = {
      contentType: "text",
    };
    if (hasXSelected) {
      metadata.x = {
        madeWithAi: xPostSettings.madeWithAi,
        paidPartnership: xPostSettings.paidPartnership,
      };
    }
    if (Object.keys(accountCaptions).length > 0) {
      metadata.accountCaptions = accountCaptions;
    }

    if (effectiveMode === "scheduled") {
      applyBulkAutoFeaturesToScheduledMetadata(metadata, {
        hasTwitterXSelected: selectedAccounts.some(
          (a) => a.platform === "twitter_x",
        ),
        resurfaceConfig,
        autoPlugConfig,
      });
    } else {
      delete metadata.bulkAutoFeatures;
    }

    if (initialScheduledId && effectiveMode === "scheduled") {
      const result = await updatePost(
        initialScheduledId,
        content.trim(),
        accountIds,
        scheduledAt,
        undefined,
        metadata,
        scheduledAt ? (intendedQueueSlotIdRef.current ?? undefined) : undefined,
      );
      if (scheduledAt) intendedQueueSlotIdRef.current = null;
      setLoading(false);
      if (result.success) {
        setScheduledPostId(initialScheduledId);
        setOverlayPhase("done");
        capturePostLifecycle(
          posthog,
          "post_scheduled",
          "text",
          accountIds.length,
        );
        invalidateQueries();
      } else {
        setOverlayPhase("idle");
        toast.error(result.error);
      }
      return;
    }

    if (initialDraftId) {
      if (effectiveMode === "draft") {
        const result = await updateDraft(
          initialDraftId,
          content.trim(),
          accountIds,
          [],
          metadata,
        );
        setLoading(false);
        if (result.success) {
          setDraftSavedPostId(initialDraftId);
          setOverlayPhase("done");
          capturePostLifecycle(
            posthog,
            "post_drafted",
            "text",
            accountIds.length,
          );
          invalidateQueries();
        } else {
          setOverlayPhase("idle");
          toast.error(result.error);
        }
        return;
      }
      if (effectiveMode === "now") {
        const result = await updateAndPublish(
          initialDraftId,
          content.trim(),
          accountIds,
          [],
          metadata,
        );
        setLoading(false);
        if (!result.success) {
          setOverlayPhase("idle");
          toast.error(result.error);
          return;
        }
        if (result.allPlatformsFailed && result.postId) {
          setOverlayPhase("idle");
          navigate(dash(`posts/${result.postId}`), { replace: true });
          invalidateQueries();
          return;
        }
        if (!result.postId) {
          setOverlayPhase("idle");
          return;
        }
        setPublishedPostId(result.postId);
        let list: Awaited<ReturnType<typeof getPostPublicationList>> = [];
        try {
          list = await getPostPublicationList(result.postId);
        } catch {
          // Proceed with empty list so publish still runs (e.g. after ETIMEDOUT)
        }
        if (list.length === 0) {
          const publishResult = await publishPostWithParallelProgress(
            result.postId,
            undefined,
            () => {},
          );
          const succeededCount =
            publishResult?.results?.filter((r) => r.status === "published")
              .length ?? 0;
          if (succeededCount === 0) {
            setOverlayPhase("idle");
            navigate(dash(`posts/${result.postId}`), { replace: true });
            invalidateQueries();
            return;
          }
          setOverlayPhase("done");
          if (
            resurfaceConfig &&
            selectedAccounts.some((a) => a.platform === "twitter_x")
          ) {
            createResurfaceSchedule(
              result.postId,
              "x",
              resurfaceConfig.intervalHours,
              resurfaceConfig.maxResurfaces,
              resurfaceConfig.plugComment?.trim() || null,
            ).catch(() => {});
          }
          await setupAutoPlug(result.postId);
          return;
        }
        const orderedList = sortBySlowPlatformsLast(list);
        const initial: PlatformResult[] = orderedList.map((pub) => ({
          platform: pub.platform,
          accountId: pub.connectedAccountId,
          accountName: pub.platformUsername
            ? `@${pub.platformUsername}`
            : (PLATFORMS.find((p) => p.id === pub.platform)?.name ??
              pub.platform),
          status: "waiting" as PlatformStatus,
        }));
        setPlatformStatuses(initial);
        setOverlayPhase("publishing");
        await publishPostWithParallelProgress(
          result.postId,
          undefined,
          (rows) => {
            setPlatformStatuses((prev) =>
              prev.map((p) => {
                const row = rows.find(
                  (r) => r.connectedAccountId === p.accountId,
                );
                if (!row) return p;
                const status: PlatformStatus =
                  row.publicationStatus === "published"
                    ? "published"
                    : row.publicationStatus === "failed"
                      ? "failed"
                      : row.publicationStatus === "publishing"
                        ? "processing"
                        : p.status;
                return {
                  ...p,
                  status,
                  error:
                    row.publicationStatus === "failed"
                      ? (row.lastError ?? undefined)
                      : undefined,
                  postUrl:
                    row.publicationStatus === "published"
                      ? (row.platformPostUrl ?? undefined)
                      : undefined,
                };
              }),
            );
          },
        );
        if (
          resurfaceConfig &&
          selectedAccounts.some((a) => a.platform === "twitter_x")
        ) {
          await createResurfaceSchedule(
            result.postId,
            "x",
            resurfaceConfig.intervalHours,
            resurfaceConfig.maxResurfaces,
            resurfaceConfig.plugComment?.trim() || null,
          );
        }
        await setupAutoPlug(result.postId);
        capturePostLifecycle(
          posthog,
          "post_published",
          "text",
          accountIds.length,
        );
        setOverlayPhase("done");
        navigate(dash(`posts/${result.postId}`), { replace: true });
        invalidateQueries();
        return;
      }
      if (effectiveMode === "scheduled") {
        const result = await updatePost(
          initialDraftId,
          content.trim(),
          accountIds,
          scheduledAt,
          undefined,
          metadata,
          scheduledAt
            ? (intendedQueueSlotIdRef.current ?? undefined)
            : undefined,
        );
        if (scheduledAt) intendedQueueSlotIdRef.current = null;
        setLoading(false);
        if (result.success) {
          setScheduledPostId(initialDraftId);
          setOverlayPhase("done");
          invalidateQueries();
        } else {
          setOverlayPhase("idle");
          toast.error(result.error);
        }
        return;
      }
    }

    const result = await createPost(
      content.trim(),
      accountIds,
      effectiveMode,
      scheduledAt,
      [],
      metadata,
      effectiveMode === "scheduled"
        ? (intendedQueueSlotIdRef.current ?? undefined)
        : undefined,
    );
    if (effectiveMode === "scheduled") intendedQueueSlotIdRef.current = null;
    setLoading(false);
    if (result.success) {
      if (effectiveMode === "now" && result.postId) {
        setPublishedPostId(result.postId);
        let list: Awaited<ReturnType<typeof getPostPublicationList>> = [];
        try {
          list = await getPostPublicationList(result.postId);
        } catch {
          // Proceed with empty list so publish still runs (e.g. after ETIMEDOUT)
        }
        if (list.length === 0) {
          const publishResult = await publishPostWithParallelProgress(
            result.postId,
            undefined,
            () => {},
          );
          const succeededCount =
            publishResult?.results?.filter((r) => r.status === "published")
              .length ?? 0;
          if (succeededCount === 0) {
            setOverlayPhase("idle");
            navigate(dash(`posts/${result.postId}`), { replace: true });
            invalidateQueries();
            return;
          }
          setOverlayPhase("done");
          if (
            resurfaceConfig &&
            selectedAccounts.some((a) => a.platform === "twitter_x")
          ) {
            createResurfaceSchedule(
              result.postId,
              "x",
              resurfaceConfig.intervalHours,
              resurfaceConfig.maxResurfaces,
              resurfaceConfig.plugComment?.trim() || null,
            ).catch(() => {});
          }
          await setupAutoPlug(result.postId);
          return;
        }
        const orderedList = sortBySlowPlatformsLast(list);
        const initial: PlatformResult[] = orderedList.map((pub) => ({
          platform: pub.platform,
          accountId: pub.connectedAccountId,
          accountName: pub.platformUsername
            ? `@${pub.platformUsername}`
            : (PLATFORMS.find((p) => p.id === pub.platform)?.name ??
              pub.platform),
          status: "waiting" as PlatformStatus,
        }));
        setPlatformStatuses(initial);
        setOverlayPhase("publishing");
        await publishPostWithParallelProgress(
          result.postId,
          undefined,
          (rows) => {
            setPlatformStatuses((prev) =>
              prev.map((p) => {
                const row = rows.find(
                  (r) => r.connectedAccountId === p.accountId,
                );
                if (!row) return p;
                const status: PlatformStatus =
                  row.publicationStatus === "published"
                    ? "published"
                    : row.publicationStatus === "failed"
                      ? "failed"
                      : row.publicationStatus === "publishing"
                        ? "processing"
                        : p.status;
                return {
                  ...p,
                  status,
                  error:
                    row.publicationStatus === "failed"
                      ? (row.lastError ?? undefined)
                      : undefined,
                  postUrl:
                    row.publicationStatus === "published"
                      ? (row.platformPostUrl ?? undefined)
                      : undefined,
                };
              }),
            );
          },
        );
        if (
          resurfaceConfig &&
          selectedAccounts.some((a) => a.platform === "twitter_x")
        ) {
          await createResurfaceSchedule(
            result.postId,
            "x",
            resurfaceConfig.intervalHours,
            resurfaceConfig.maxResurfaces,
            resurfaceConfig.plugComment?.trim() || null,
          );
        }
        await setupAutoPlug(result.postId);
        capturePostLifecycle(
          posthog,
          "post_published",
          "text",
          accountIds.length,
        );
        setOverlayPhase("done");
        navigate(dash(`posts/${result.postId}`), { replace: true });
        invalidateQueries();
        return;
      }
      if (effectiveMode === "draft" && result.postId) {
        setDraftSavedPostId(result.postId);
        setOverlayPhase("done");
        capturePostLifecycle(
          posthog,
          "post_drafted",
          "text",
          accountIds.length,
        );
      }
      if (effectiveMode === "scheduled" && result.postId) {
        setScheduledPostId(result.postId);
        setOverlayPhase("done");
        capturePostLifecycle(
          posthog,
          "post_scheduled",
          "text",
          accountIds.length,
        );
      }
      invalidateQueries();
    } else {
      setOverlayPhase("idle");
      toast.error(result.error);
    }
  };

  const handleDeleteDraft = async () => {
    if (!initialDraftId) return;
    const result = await deleteDraft(initialDraftId);
    if (result.success) {
      navigate(dash("posts/drafts"), { replace: true });
      invalidateQueries();
    } else {
      toast.error(result.error);
    }
  };

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const q = accountSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.platformUsername?.toLowerCase().includes(q) ||
        a.platform?.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);

  const submitDisabledReason = !content.trim()
    ? "Add some text to post"
    : mode === "scheduled" && !scheduledAt
      ? "Pick a date and time to schedule"
      : null;

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? initialDraftId || initialScheduledId || initialEditId
          ? "Update"
          : "Schedule post"
        : "Post now";

  if (draftLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted">
        Loading draft...
      </div>
    );
  }

  return (
    <>
      {overlayPhase !== "idle" && (
        <UploadPublishOverlay
          phase={overlayPhase === "saving" ? "saving" : "publishing"}
          isScheduling={mode === "scheduled"}
          showLinks={overlayPhase === "done"}
          draftSuccess={!!draftSavedPostId}
          draftPostId={draftSavedPostId}
          scheduleSuccess={!!scheduledPostId}
          publishedPostId={scheduledPostId ?? publishedPostId}
          publishedToX={selectedAccounts.some(
            (a) => a.platform === "twitter_x",
          )}
          resurfacePreFill={
            overlayPhase === "done" &&
            resurfaceConfig &&
            !scheduledPostId &&
            !draftSavedPostId
              ? {
                  intervalHours: resurfaceConfig.intervalHours,
                  maxResurfaces: resurfaceConfig.maxResurfaces,
                  plugComment: resurfaceConfig.plugComment ?? "",
                }
              : null
          }
          platformStatuses={platformStatuses}
          allDone={
            platformStatuses.length > 0 &&
            platformStatuses.every(
              (p) => p.status === "published" || p.status === "failed",
            )
          }
          onClose={() => {
            const allFailed =
              platformStatuses.length > 0 &&
              platformStatuses.every((p) => p.status === "failed");
            if (allFailed && publishedPostId) {
              navigate(dash(`posts/${publishedPostId}`), {
                replace: true,
              });
              invalidateQueries();
            } else {
              setScheduledPostId(null);
              setDraftSavedPostId(null);
              setOverlayPhase("idle");
            }
          }}
        />
      )}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 lg:flex-row lg:items-start"
      >
        <div className="min-w-0 flex-1 space-y-6 lg:max-w-[65%]">
          <PostFormOptions
            accounts={filteredAccounts}
            selectedIds={selectedIds}
            onToggleAccount={toggleAccount}
            selectAll={selectAll}
            mode={mode}
            setMode={setMode}
            scheduledAt={scheduledAt}
            setScheduledAt={setScheduledAt}
            loading={loading}
            submitLabel={submitLabel}
            submitDisabled={
              accounts.length === 0 ||
              !content.trim() ||
              (mode === "scheduled" && !scheduledAt)
            }
            use24HourTimeFormat={use24HourTimeFormat}
            dateFormat={dateFormat}
            hideScheduleAndActions
            searchSlot={
              <input
                type="search"
                placeholder="Search accounts..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="h-8 w-full rounded border border-input bg-bg px-2 py-1 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            }
            remember={remember}
            onRememberChange={handleRememberChange}
            supportedPlatforms={supportedPlatforms}
            accountsLoading={accountsLoading}
            isGuest={isGuest}
            freePostsRemaining={
              !isGuest && subscriptionTier === "free"
                ? getFreePostsRemaining(subscriptionTier, freePostsUsed)
                : null
            }
            subscriptionTier={subscriptionTier}
          />

          <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
            <label
              htmlFor="content"
              className="block text-sm font-semibold text-text mb-2"
            >
              What do you want to post?
            </label>
            <AutoResizeTextarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your post..."
              rows={6}
              className="w-full rounded-xl border border-input bg-bg px-4 py-3 text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              required
              autoFocus
              maxHeight={400}
            />
            <CaptionCounter
              caption={content}
              selectedAccounts={selectedAccounts.map((a) => ({
                platform: a.platform,
                isTwitterPremium: a.isTwitterPremium ?? false,
                platformUsername: a.platformUsername ?? null,
              }))}
            />
            {showContentError && !content.trim() && (
              <p className="mt-2 text-xs text-destructive">Text is required</p>
            )}
            {twitterThreadWarning && (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg px-3 py-2">
                Twitter: This will post as a thread (each part between{" "}
                <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">
                  ---
                </code>{" "}
                is a separate tweet). Standard accounts: 280 chars per part;
                Premium allows longer. Media will only appear on the first
                tweet.
              </p>
            )}
          </div>

          {(showCustomCaptionsSection || hasXSelected) && (
            <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
              <p className="mb-3 text-xs text-text-muted">
                Post configurations & tools
              </p>
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 min-h-[44px] sm:min-h-0 -mx-1 px-1 scrollbar-thin">
                {showCustomCaptionsSection && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveConfigPanel((p) =>
                        p === "platform-captions" ? null : "platform-captions",
                      )
                    }
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors shrink-0 ${
                      activeConfigPanel === "platform-captions"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
                    }`}
                  >
                    <Circle className="h-3.5 w-3.5 text-text-muted" />
                    <span>Platform Captions</span>
                    {activeConfigPanel === "platform-captions" ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {hasXSelected && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveConfigPanel((p) => (p === "x" ? null : "x"))
                    }
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors shrink-0 ${
                      activeConfigPanel === "x"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    <span>X Settings</span>
                    {activeConfigPanel === "x" ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>

              {activeConfigPanel === "platform-captions" && (
                <div className="mt-2 space-y-4 border-t border-border pt-4">
                  {selectedAccounts.map((account) => {
                    const state =
                      accountCaptionsState[account.id] ??
                      ({
                        overridden: false,
                        value: "",
                      } as AccountCaptionState);
                    const username = account.platformUsername?.trim()
                      ? `@${account.platformUsername}`
                      : account.platform;
                    const platformName = platformDisplayName(account.platform);
                    return (
                      <div
                        key={account.id}
                        className="rounded-xl border border-border bg-bg p-4"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <AccountAvatar
                              accountId={account.id}
                              profileImageUrl={account.profileImageUrl}
                              username={account.platformUsername}
                              platform={account.platform}
                              size="sm"
                            />
                            <span className="min-w-0 truncate text-sm font-medium text-text">
                              {username}
                              <span className="text-text-muted">
                                {" · "}
                                {platformName}
                              </span>
                            </span>
                            <PlatformIcon
                              platform={account.platform}
                              size={14}
                              className="shrink-0 text-text-muted"
                            />
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {state.overridden ? (
                              <>
                                <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                                  Edited caption
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAccountCaptionsState((prev) => ({
                                      ...prev,
                                      [account.id]: {
                                        overridden: false,
                                        value: "",
                                      },
                                    }))
                                  }
                                  className="text-xs font-medium text-accent hover:text-accent-hover"
                                >
                                  Clear
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-text-muted">
                                  Using main caption
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAccountCaptionsState((prev) => ({
                                      ...prev,
                                      [account.id]: {
                                        overridden: true,
                                        value: content.trim(),
                                      },
                                    }))
                                  }
                                  className="text-xs font-medium text-accent hover:text-accent-hover"
                                >
                                  Edit
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <AutoResizeTextarea
                          rows={3}
                          placeholder={
                            state.overridden
                              ? undefined
                              : content || "Main caption..."
                          }
                          value={state.overridden ? state.value : ""}
                          readOnly={!state.overridden}
                          onChange={(e) =>
                            state.overridden &&
                            setAccountCaptionsState((prev) => ({
                              ...prev,
                              [account.id]: {
                                ...(prev[account.id] ?? {
                                  overridden: false,
                                  value: "",
                                }),
                                overridden: true,
                                value: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-input bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-70"
                          maxHeight={160}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {activeConfigPanel === "x" && (
                <div className="mt-2 border-t border-border pt-4">
                  <XPostSettingsInline
                    value={xPostSettings}
                    onChange={setXPostSettings}
                    isVisible={activeConfigPanel === "x"}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <SchedulePostSidebar
          mode={mode}
          setMode={setMode}
          scheduledAt={scheduledAt}
          setScheduledAt={setScheduledAt}
          loading={loading}
          submitDisabled={
            accounts.length === 0 ||
            !content.trim() ||
            (mode === "scheduled" && !scheduledAt)
          }
          hasAccountSelected={selectedIds.size > 0}
          submitDisabledReason={submitDisabledReason}
          primaryActionDisabled={isFreePublishBlocked(
            subscriptionTier,
            freePostsUsed,
            "now",
          )}
          primaryActionDisabledReason={freePublishBlockReason(
            subscriptionTier,
            freePostsUsed,
            "now",
          )}
          isGuest={isGuest}
          freePostsRemaining={
            !isGuest && subscriptionTier === "free"
              ? getFreePostsRemaining(subscriptionTier, freePostsUsed)
              : null
          }
          use24HourTimeFormat={use24HourTimeFormat}
          dateFormat={dateFormat}
          timezone={timezone}
          intendedModeRef={intendedModeRef}
          intendedQueueSlotIdRef={intendedQueueSlotIdRef}
          formRef={formRef}
          draftId={initialDraftId ?? null}
          onDeleteDraft={initialDraftId ? handleDeleteDraft : undefined}
          autoRepost={
            resurfaceVisible
              ? {
                  visible: true,
                  enabled: !!resurfaceConfig,
                  onToggle: () => {
                    if (resurfaceConfig) setResurfaceConfig(null);
                    else {
                      configBeforeResurfaceRef.current = resurfaceConfig;
                      setResurfaceModalOpen(true);
                    }
                  },
                  onOpenSettings: () => {
                    configBeforeResurfaceRef.current = resurfaceConfig;
                    setResurfaceModalOpen(true);
                  },
                }
              : null
          }
          autoPlug={
            autoPlugVisible
              ? {
                  visible: true,
                  enabled: !!autoPlugConfig,
                  onToggle: () => {
                    if (autoPlugConfig) setAutoPlugConfig(null);
                    else {
                      configBeforeAutoPlugRef.current = autoPlugConfig;
                      setAutoplugModalOpen(true);
                    }
                  },
                  onOpenSettings: () => {
                    configBeforeAutoPlugRef.current = autoPlugConfig;
                    setAutoplugModalOpen(true);
                  },
                }
              : null
          }
          allowAutoRepost={allowAutoRepost}
          allowAutoPlug={allowAutoPlug}
          rememberAutoFeatures={rememberAutoFeatures}
          onRememberAutoFeaturesChange={setRememberAutoFeatures}
        >
          {!initialDraftId && !initialScheduledId && !initialEditId ? (
            <SwitchPostTypeLinks current="text" caption={content} />
          ) : null}
          <div className="hidden lg:block rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
              Post Preview
            </h3>
            {selectedAccounts.length === 0 ? (
              <p className="text-sm italic text-text-muted">
                Select an account to preview.
              </p>
            ) : (
              <div className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <AccountAvatar
                    accountId={previewAccount?.id}
                    profileImageUrl={previewAccount?.profileImageUrl}
                    username={previewAccount?.platformUsername}
                    platform={previewAccount?.platform}
                    size="md"
                    className="h-10! w-10!"
                  />
                </div>
                <div className="min-w-0 flex-1 max-h-[320px] overflow-y-auto">
                  <p className="text-sm font-semibold text-text shrink-0 inline-flex items-center gap-0.5 flex-wrap">
                    {previewAccount?.platformUsername
                      ? `@${previewAccount.platformUsername}`
                      : (previewAccount?.platform ?? "Account")}
                    {previewAccount?.platform === "twitter_x" &&
                      previewAccount?.isTwitterPremium && (
                        <img
                          src="/icons/twitter-premium.svg"
                          alt=""
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden
                        />
                      )}
                  </p>
                  {content.trim() ? (
                    <p className="mt-0.5 text-sm text-text whitespace-pre-wrap wrap-break-word">
                      {content}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm italic text-text-muted">
                      Start typing to see your post preview.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </SchedulePostSidebar>

        {resurfaceModalOpen && (
          <AutoResurfaceSettingsModal
            isOpen={true}
            selectedAccountIds={selectedAccountIds}
            allAccounts={accounts}
            initialConfig={resurfaceConfig}
            onChange={setResurfaceConfig}
            onDone={() => setResurfaceModalOpen(false)}
            onCancel={() => {
              setResurfaceConfig(configBeforeResurfaceRef.current ?? null);
              setResurfaceModalOpen(false);
            }}
            use24HourTimeFormat={use24HourTimeFormat}
          />
        )}
        {autoplugModalOpen && (
          <AutoPlugSettingsModal
            isOpen={true}
            selectedAccountIds={selectedAccountIds}
            allAccounts={accounts as ConnectedAccount[]}
            initialConfig={autoPlugConfig}
            onChange={setAutoPlugConfig}
            onDone={() => setAutoplugModalOpen(false)}
            onCancel={() => {
              setAutoPlugConfig(configBeforeAutoPlugRef.current ?? null);
              setAutoplugModalOpen(false);
            }}
          />
        )}
      </form>
    </>
  );
}

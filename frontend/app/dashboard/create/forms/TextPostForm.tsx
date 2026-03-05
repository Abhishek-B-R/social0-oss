"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createPost,
  getDraft,
  deleteDraft,
  updateDraft,
  updateAndPublish,
  updatePost,
  type PublishMode,
} from "@/app/actions/posts";
import { createAutoPlug } from "@/app/actions/resurface";
import { useRememberedAccounts } from "@/lib/remembered-accounts";
import { useRememberedAutoRepostAutoPlug } from "@/lib/remembered-autorepost-autoplug";
import { PostFormOptions } from "../PostFormOptions";
import { SchedulePostSidebar } from "../SchedulePostSidebar";
import { getResurfacePlatforms } from "@/lib/resurface-utils";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type {
  AutoPlugConfig,
  ConnectedAccount,
} from "@/components/autoplug/AutoPlugPanel";
import { AutoResurfaceSettingsModal } from "@/components/repost/AutoResurfaceSettingsModal";
import { AutoPlugSettingsModal } from "@/components/autoplug/AutoPlugSettingsModal";
import { PLATFORMS } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { UploadPublishOverlay } from "@/components/UploadPublishOverlay";
import {
  consumeComposerPayload,
  clearComposerPayload,
} from "@/lib/composer-bridge";
import { CaptionCounter } from "@/components/caption-counter";

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
  use24HourTimeFormat = false,
  draftId: initialDraftId,
  allowAutoRepost = true,
  allowAutoPlug = true,
  supportedPlatforms,
}: {
  accounts: Account[];
  use24HourTimeFormat?: boolean;
  draftId?: string;
  allowAutoRepost?: boolean;
  allowAutoPlug?: boolean;
  supportedPlatforms?: string[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const [content, setContent] = useState("");
  const { remember, setRemember, getInitialSelectedIds, persistSelection } =
    useRememberedAccounts("post-form");
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (initialDraftId) return new Set();
    const validIds = new Set(
      accounts.filter((a) => !a.tokenExpired).map((a) => a.id),
    );
    return getInitialSelectedIds(validIds);
  });
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(!!initialDraftId);
  type OverlayPhase = "idle" | "publishing" | "saving" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const [customCaptionsExpanded, setCustomCaptionsExpanded] = useState(false);
  const [accountCaptionsState, setAccountCaptionsState] = useState<
    Record<string, AccountCaptionState>
  >({});
  const searchParams = useSearchParams();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (!e.ctrlKey && !e.metaKey)) return;
      const form = formRef.current;
      if (!form || !form.contains(e.target as Node)) return;
      e.preventDefault();
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
          setError(result.error);
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
        if (draft.scheduledAt) setMode("scheduled");
      } catch {
        if (!cancelled) setError("Failed to load draft");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId, accounts]);

  useEffect(() => {
    if (initialDraftId) return;
    if (searchParams.get("fromComposer") !== "1") return;
    const payload = consumeComposerPayload();
    if (!payload) return;
    if (payload.text) {
      setContent((prev) => (prev ? prev : payload.text));
    }
    return () => {
      setTimeout(clearComposerPayload, 100);
    };
  }, [initialDraftId, searchParams]);

  useEffect(() => {
    if (remember) persistSelection(selectedIds);
  }, [remember, selectedIds, persistSelection]);

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
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
    const { autoRepostConfig, autoPlugConfig } =
      getAutoFeaturesInitialState();
    if (autoRepostConfig) setResurfaceConfig(autoRepostConfig);
    if (autoPlugConfig) setAutoPlugConfig(autoPlugConfig);
    hasRestoredAutoFeaturesRef.current = true;
  }, [
    hasXForResurface,
    rememberAutoFeatures,
    getAutoFeaturesInitialState,
  ]);

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
    setError(null);
    if (!content.trim()) {
      setShowContentError(true);
      return;
    }
    setShowContentError(false);
    if ((intendedModeRef.current ?? mode) === "scheduled") {
      if (!scheduledAt) {
        setError("Please select a date and time.");
        return;
      }
      if (scheduledAt <= new Date()) {
        setError("Scheduled time must be in the future.");
        return;
      }
    }
    setLoading(true);
    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;
    if (effectiveMode === "now") setOverlayPhase("publishing");
    if (effectiveMode === "draft") setOverlayPhase("saving");
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
    if (Object.keys(accountCaptions).length > 0) {
      metadata.accountCaptions = accountCaptions;
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
          router.push("/dashboard/posts/drafts");
          router.refresh();
        } else {
          setOverlayPhase("idle");
          setError(result.error);
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
        if (result.success) {
          if (result.allPlatformsFailed && result.postId) {
            router.push(`/dashboard/posts/${result.postId}`);
            router.refresh();
            return;
          }
          if (autoPlugConfig) {
            const xAccount = selectedAccounts.find(
              (a) => a.platform === "twitter_x",
            );
            if (xAccount) {
              createAutoPlug(result.postId, xAccount.id, autoPlugConfig).catch(
                () => {},
              );
            }
          }
          setPublishedPostId(result.postId ?? null);
          setOverlayPhase("done");
        } else {
          setOverlayPhase("idle");
          setError(result.error);
        }
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
        );
        setLoading(false);
        if (result.success) {
          router.push("/dashboard/posts/scheduled");
          router.refresh();
        } else {
          setOverlayPhase("idle");
          setError(result.error);
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
    );
    setLoading(false);
    if (result.success) {
      if (effectiveMode === "now" && result.postId && autoPlugConfig) {
        const xAccount = selectedAccounts.find(
          (a) => a.platform === "twitter_x",
        );
        if (xAccount) {
          await createAutoPlug(result.postId, xAccount.id, autoPlugConfig);
        }
      }
      if (effectiveMode === "now") {
        if (result.allPlatformsFailed && result.postId) {
          router.push(`/dashboard/posts/${result.postId}`);
          router.refresh();
          return;
        }
        setPublishedPostId(result.postId ?? null);
        setOverlayPhase("done");
      } else {
        if (effectiveMode === "draft") router.push("/dashboard/posts/drafts");
        if (effectiveMode === "scheduled")
          router.push("/dashboard/posts/scheduled");
        router.refresh();
      }
    } else {
      setOverlayPhase("idle");
      setError(result.error);
    }
  };

  const handleDeleteDraft = async () => {
    if (!initialDraftId) return;
    const result = await deleteDraft(initialDraftId);
    if (result.success) {
      router.push("/dashboard/posts/drafts");
      router.refresh();
    } else {
      setError(result.error);
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

  const submitDisabledReason =
    !content.trim()
      ? "Add some text to post"
      : mode === "scheduled" && !scheduledAt
          ? "Pick a date and time to schedule"
          : null;

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
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
          publishedPostId={overlayPhase === "done" ? publishedPostId : null}
          publishedToX={selectedAccounts.some(
            (a) => a.platform === "twitter_x",
          )}
          resurfacePreFill={
            overlayPhase === "done" && resurfaceConfig
              ? {
                  intervalHours: resurfaceConfig.intervalHours,
                  maxResurfaces: resurfaceConfig.maxResurfaces,
                  plugComment: resurfaceConfig.plugComment ?? "",
                }
              : null
          }
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
            error={error}
            loading={loading}
            submitLabel={submitLabel}
            submitDisabled={
              accounts.length === 0 ||
              !content.trim() ||
              (mode === "scheduled" && !scheduledAt)
            }
            use24HourTimeFormat={use24HourTimeFormat}
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
            onRememberChange={setRemember}
            supportedPlatforms={supportedPlatforms}
          />

          {error && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
            <label
              htmlFor="content"
              className="block text-sm font-semibold text-text mb-2"
            >
              What do you want to post?
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your post..."
              rows={6}
              className="w-full rounded-xl border border-input bg-bg px-4 py-3 text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              required
              autoFocus
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
                Premium allows longer. Media will only appear on the first tweet.
              </p>
            )}
          </div>

          {showCustomCaptionsSection && (
            <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
              <button
                type="button"
                onClick={() => setCustomCaptionsExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-sm font-semibold text-text">
                  Custom Captions
                </span>
                <span className="text-text-muted">
                  {customCaptionsExpanded ? "▼" : "▶"}
                </span>
              </button>
              {customCaptionsExpanded && (
                <div className="mt-4 space-y-4">
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
                            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-muted text-sm font-semibold text-text-muted">
                              {account.profileImageUrl?.trim() ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={account.profileImageUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                (account.platformUsername ?? account.platform)
                                  .charAt(0)
                                  .toUpperCase()
                              )}
                            </div>
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
                        <textarea
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
                        />
                      </div>
                    );
                  })}
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
          error={error}
          use24HourTimeFormat={use24HourTimeFormat}
          intendedModeRef={intendedModeRef}
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
          <div className="hidden lg:block rounded-xl border border-border bg-bg p-4 shadow-sm mt-16">
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
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-muted text-sm font-semibold text-text-muted">
                    {selectedAccounts[0]?.profileImageUrl?.trim() ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={selectedAccounts[0].profileImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      (
                        selectedAccounts[0]?.platformUsername ??
                        selectedAccounts[0]?.platform ??
                        "A"
                      )
                        .charAt(0)
                        .toUpperCase()
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1 max-h-[320px] overflow-y-auto">
                  <p className="text-sm font-semibold text-text shrink-0">
                    {selectedAccounts[0]?.platformUsername
                      ? `@${selectedAccounts[0].platformUsername}`
                      : (selectedAccounts[0]?.platform ?? "Account")}
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

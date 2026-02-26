"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
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

const TWITTER_MAX_LENGTH = 280;
const TWITTER_THREAD_SEP = "---";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  tokenExpired?: boolean;
};

export function TextPostForm({
  accounts,
  use24HourTimeFormat = false,
  draftId: initialDraftId,
}: {
  accounts: Account[];
  use24HourTimeFormat?: boolean;
  draftId?: string;
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
      accounts.filter((a) => !a.tokenExpired).map((a) => a.id)
    );
    return getInitialSelectedIds(validIds);
  });
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(!!initialDraftId);
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
  const [showContentError, setShowContentError] = useState(false);

  useEffect(() => {
    if (!initialDraftId) return;
    let cancelled = false;
    (async () => {
      const result = await getDraft(initialDraftId);
      if (cancelled) return;
      setDraftLoading(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const { draft } = result;
      setContent(draft.originalContent ?? "");
      setSelectedIds(new Set(draft.connectedAccountIds));
      setScheduledAt(draft.scheduledAt ? new Date(draft.scheduledAt) : null);
      if (draft.scheduledAt) setMode("scheduled");
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId]);

  useEffect(() => {
    if (remember) persistSelection(selectedIds);
  }, [remember, selectedIds, persistSelection]);

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const selectedAccountIds = Array.from(selectedIds);
  const hasXForResurface =
    getResurfacePlatforms(selectedAccountIds, accounts).length > 0;
  const resurfaceVisible = hasXForResurface;
  const autoPlugVisible = hasXForResurface;
  const hasTwitter = selectedAccounts.some((a) => a.platform === "twitter_x");
  const isThread = content.includes(TWITTER_THREAD_SEP);
  const threadParts = isThread
    ? content
        .split(TWITTER_THREAD_SEP)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  const twitterPartOverLimit =
    hasTwitter && isThread
      ? threadParts.findIndex((p) => p.length > TWITTER_MAX_LENGTH)
      : -1;
  const twitterThreadWarning = hasTwitter && isThread && threadParts.length > 1;
  const twitterValidationError =
    twitterPartOverLimit !== -1
      ? `Twitter: Part ${twitterPartOverLimit + 1} is ${threadParts[twitterPartOverLimit].length} characters (max ${TWITTER_MAX_LENGTH}). Shorten it to publish.`
      : null;

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
    if (twitterValidationError) {
      setError(twitterValidationError);
      return;
    }
    setLoading(true);
    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;
    const accountIds = Array.from(selectedIds);

    if (initialDraftId) {
      if (effectiveMode === "draft") {
        const result = await updateDraft(
          initialDraftId,
          content.trim(),
          accountIds,
        );
        setLoading(false);
        if (result.success) {
          router.push("/dashboard/posts/drafts");
          router.refresh();
        } else {
          setError(result.error);
        }
        return;
      }
      if (effectiveMode === "now") {
        const result = await updateAndPublish(
          initialDraftId,
          content.trim(),
          accountIds,
        );
        setLoading(false);
        if (result.success) {
          if (autoPlugConfig) {
            const xAccount = selectedAccounts.find(
              (a) => a.platform === "twitter_x",
            );
            if (xAccount) {
              await createAutoPlug(
                result.postId,
                xAccount.id,
                autoPlugConfig,
              );
            }
          }
          router.push("/dashboard/posts");
          router.refresh();
        } else {
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
        );
        setLoading(false);
        if (result.success) {
          router.push("/dashboard/posts/scheduled");
          router.refresh();
        } else {
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
      router.push("/dashboard/posts");
      router.refresh();
    } else {
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
          onCancel={() => router.push("/dashboard/posts")}
          submitLabel={submitLabel}
          submitDisabled={
            accounts.length === 0 ||
            !content.trim() ||
            (mode === "scheduled" && !scheduledAt) ||
            !!twitterValidationError
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
        />

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
            placeholder="Write your post... Use --- on its own line to split into a Twitter thread (each part max 280 characters)."
            rows={6}
            className="w-full rounded-xl border border-input bg-bg px-4 py-3 text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            required
          />
          {showContentError && !content.trim() && (
            <p className="mt-2 text-xs text-destructive">Text is required</p>
          )}
          {twitterThreadWarning && (
            <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Twitter: This will post as a thread (each part between{" "}
              <code className="bg-amber-100 px-1 rounded">---</code> is a
              separate tweet). Max {TWITTER_MAX_LENGTH} characters per part.
              Media will only appear on the first tweet.
            </p>
          )}
        </div>
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
          (mode === "scheduled" && !scheduledAt) ||
          !!twitterValidationError
        }
        hasAccountSelected={selectedIds.size > 0}
        error={error}
        use24HourTimeFormat={use24HourTimeFormat}
        onCancel={() => router.push("/dashboard/posts")}
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
      >
        <div className="hidden lg:block rounded-xl border border-border bg-bg p-4 shadow-sm -mt-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
            Post Preview
          </h3>
          {selectedAccounts.length === 0 ? (
            <p className="text-sm italic text-text-muted">
              Select an account to preview.
            </p>
          ) : (
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
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
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text">
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
  );
}

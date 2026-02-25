"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { createAutoPlug } from "@/app/actions/resurface";
import { PostFormOptions } from "../PostFormOptions";
import { SchedulePostSidebar } from "../SchedulePostSidebar";
import { AutoFeaturesCard } from "@/components/repost/AutoFeaturesCard";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";

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

export function TextPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const [content, setContent] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setResurfaceConfig] = useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
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
    if (twitterValidationError) {
      setError(twitterValidationError);
      return;
    }
    setLoading(true);
    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;
    const result = await createPost(
      content.trim(),
      Array.from(selectedIds),
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

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6 lg:flex-row lg:items-start">
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
            hideScheduleAndActions
            searchSlot={
              <input
                type="search"
                placeholder="Search accounts..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="h-8 w-full text-xs rounded border border-gray-200 px-2 py-1 text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
              />
            }
          />

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <label
            htmlFor="content"
            className="block text-sm font-semibold text-gray-900 mb-2"
          >
            What do you want to post?
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your post... Use --- on its own line to split into a Twitter thread (each part max 280 characters)."
            rows={6}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            required
          />
          {twitterThreadWarning && (
            <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Twitter: This will post as a thread (each part between{" "}
              <code className="bg-amber-100 px-1 rounded">---</code> is a separate
              tweet). Max {TWITTER_MAX_LENGTH} characters per part. Media will
              only appear on the first tweet.
            </p>
          )}
        </div>

        <AutoFeaturesCard
          selectedAccountIds={Array.from(selectedIds)}
          allAccounts={accounts}
          onResurfaceChange={setResurfaceConfig}
          onAutoPlugChange={setAutoPlugConfig}
        />
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
        onCancel={() => router.push("/dashboard/posts")}
        intendedModeRef={intendedModeRef}
        formRef={formRef}
      />
    </form>
  );
}

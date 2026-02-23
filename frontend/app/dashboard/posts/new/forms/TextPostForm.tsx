"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { createAutoPlug } from "@/app/actions/resurface";
import { PostFormOptions } from "../PostFormOptions";
import { AutoFeaturesCard } from "@/components/resurface/AutoFeaturesCard";
import type { AutoResurfaceConfig } from "@/components/resurface/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";

const TWITTER_MAX_LENGTH = 280;
const TWITTER_THREAD_SEP = "---";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

export function TextPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resurfaceConfig, setResurfaceConfig] = useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(null);

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const hasTwitter = selectedAccounts.some((a) => a.platform === "twitter_x");
  const isThread = content.includes(TWITTER_THREAD_SEP);
  const threadParts = isThread
    ? content.split(TWITTER_THREAD_SEP).map((p) => p.trim()).filter(Boolean)
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

  const selectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
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
    const result = await createPost(
      content.trim(),
      Array.from(selectedIds),
      mode,
      scheduledAt,
    );
    setLoading(false);
    if (result.success) {
      if (mode === "now" && result.postId && autoPlugConfig) {
        const xAccount = selectedAccounts.find((a) => a.platform === "twitter_x");
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

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
        : "Post now";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
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
            Twitter: This will post as a thread (each part between <code className="bg-amber-100 px-1 rounded">---</code> is a separate tweet). Max {TWITTER_MAX_LENGTH} characters per part. Media will only appear on the first tweet.
          </p>
        )}
      </div>

      <AutoFeaturesCard
        selectedAccountIds={Array.from(selectedIds)}
        allAccounts={accounts}
        onResurfaceChange={setResurfaceConfig}
        onAutoPlugChange={setAutoPlugConfig}
      />

      <PostFormOptions
        accounts={accounts}
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
      />
    </form>
  );
}

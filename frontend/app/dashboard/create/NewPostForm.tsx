"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { PLATFORMS } from "@/lib/platforms";
import { AccountAvatar } from "@/components/AccountAvatar";
import { ScheduleDateTimePicker } from "@/components/ui/ScheduleDateTimePicker";

const TWITTER_THREAD_SEP = "---";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  tokenExpired?: boolean;
};

export function NewPostForm({
  accounts,
  use24HourTimeFormat = false,
}: {
  accounts: Account[];
  use24HourTimeFormat?: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const hasTwitter = selectedAccounts.some((a) => a.platform === "twitter_x");
  const isThread = content.includes(TWITTER_THREAD_SEP);
  const threadParts = isThread
    ? content
        .split(TWITTER_THREAD_SEP)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  const twitterThreadWarning = hasTwitter && isThread && threadParts.length > 1;

  const platformName = (platformId: string) =>
    PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;

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
    if (mode === "scheduled") {
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
    const result = await createPost(
      content.trim(),
      Array.from(selectedIds),
      mode,
      scheduledAt,
    );
    setLoading(false);
    if (result.success) {
      router.push("/dashboard/posts");
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
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
        />
        {twitterThreadWarning && (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg px-3 py-2">
            Twitter: This will post as a thread (each part between{" "}
            <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">---</code> is a separate
            tweet). Standard accounts: 280 chars per part; Premium allows longer. Media will
            only appear on the first tweet.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-text">
            Post to
          </label>
          <button
            type="button"
            onClick={selectAll}
            className="text-sm font-medium text-accent hover:text-accent-hover"
          >
            {selectableAccounts.length > 0 &&
            selectableAccounts.every((a) => selectedIds.has(a.id))
              ? "Deselect all"
              : "Select all"}
          </button>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-xl p-4 border border-amber-100 dark:border-amber-800/60">
            Connect at least one account from the dashboard to post.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((acc) => {
              const expired = !!acc.tokenExpired;
              return (
                <label
                  key={acc.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border border-border bg-bg-muted/30 hover:bg-bg-muted/50 has-checked:border-accent has-checked:bg-accent/10 ${
                    expired ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  }`}
                  title={
                    expired
                      ? "Token expired — reconnect in Connections page"
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(acc.id)}
                    onChange={() => !expired && toggleAccount(acc.id)}
                    disabled={expired}
                    className="size-4 rounded border-input bg-bg text-accent focus:ring-accent disabled:opacity-50"
                  />
                  <AccountAvatar
                    profileImageUrl={acc.profileImageUrl}
                    username={acc.platformUsername}
                    platform={acc.platform}
                    size="sm"
                  />
                  <span className="text-sm font-medium text-text">
                    {platformName(acc.platform)}
                    {expired && (
                      <span
                        className="ml-1.5 inline-flex items-center rounded bg-destructive/10 text-destructive px-1.5 py-0.5 text-xs font-medium"
                        title="Token expired — reconnect in Connections page"
                      >
                        Token expired
                      </span>
                    )}
                    {acc.platformUsername && (
                      <span className="text-text-muted font-normal">
                        {" "}
                        @{acc.platformUsername}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
        <p className="block text-sm font-semibold text-text mb-4">
          When do you want to publish?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-bg-muted/30 cursor-pointer hover:bg-bg-muted/50 has-checked:border-accent has-checked:bg-accent/10 transition-colors">
            <input
              type="radio"
              name="publishMode"
              checked={mode === "now"}
              onChange={() => setMode("now")}
              className="mt-0.5 size-4 border-input bg-bg text-accent focus:ring-accent"
            />
            <div>
              <span className="block font-medium text-text">Post now</span>
              <span className="block text-sm text-text-muted mt-0.5">
                Publish right away
              </span>
            </div>
          </label>
          <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-bg-muted/30 cursor-pointer hover:bg-bg-muted/50 has-checked:border-accent has-checked:bg-accent/10 transition-colors">
            <input
              type="radio"
              name="publishMode"
              checked={mode === "scheduled"}
              onChange={() => setMode("scheduled")}
              className="mt-0.5 size-4 border-input bg-bg text-accent focus:ring-accent"
            />
            <div>
              <span className="block font-medium text-text">
                Schedule for later
              </span>
              <span className="block text-sm text-text-muted mt-0.5">
                Pick date & time
              </span>
            </div>
          </label>
        </div>
        {mode === "scheduled" && (
          <div className="mt-4">
            <ScheduleDateTimePicker
              value={scheduledAt}
              onChange={setScheduledAt}
              minDate={new Date()}
              placeholder="Pick date & time"
              use24HourTimeFormat={use24HourTimeFormat}
            />
          </div>
        )}
        <p className="mt-4 text-sm text-text-muted">
          {mode === "draft" ? (
            <span className="text-accent font-medium">
              Saving as draft — you can publish later from Posts.
            </span>
          ) : (
            <>
              Or{" "}
              <button
                type="button"
                onClick={() => setMode("draft")}
                className="font-medium text-accent hover:text-accent-hover"
              >
                save as draft
              </button>{" "}
              to finish later.
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/10 text-destructive px-4 py-3 text-sm font-medium border border-destructive/30">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={
            loading ||
            accounts.length === 0 ||
            !content.trim() ||
            (mode === "scheduled" && !scheduledAt)
          }
          className="rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 shadow-lg transition-colors"
        >
          {loading
            ? "Saving..."
            : mode === "draft"
              ? "Save draft"
              : mode === "scheduled"
                ? "Schedule post"
                : "Post now"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/posts")}
          className="rounded-xl border border-border bg-bg-elevated px-6 py-3 font-medium text-text shadow-sm hover:bg-bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

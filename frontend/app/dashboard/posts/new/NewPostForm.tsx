"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { PLATFORMS } from "@/lib/platforms";
import { ScheduleDateTimePicker } from "@/components/ui/ScheduleDateTimePicker";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

export function NewPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);
    const result = await createPost(
      content,
      Array.from(selectedIds),
      mode,
      scheduledAt
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
          placeholder="Write your post..."
          rows={6}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          required
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-gray-900">
            Post to
          </label>
          <button
            type="button"
            onClick={selectAll}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            {selectedIds.size === accounts.length
              ? "Deselect all"
              : "Select all"}
          </button>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-4 border border-amber-100">
            Connect at least one account from the dashboard to post.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((acc) => (
              <label
                key={acc.id}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 hover:border-gray-300 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(acc.id)}
                  onChange={() => toggleAccount(acc.id)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4"
                />
                {acc.profileImageUrl && (
                  <img
                    src={acc.profileImageUrl}
                    alt=""
                    className="size-9 rounded-full"
                  />
                )}
                <span className="text-sm font-medium text-gray-900">
                  {platformName(acc.platform)}
                  {acc.platform === "medium" && (
                    <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-xs font-medium" title="Editing and deleting not supported">
                      Publish only
                    </span>
                  )}
                  {acc.platformUsername && (
                    <span className="text-gray-500 font-normal">
                      {" "}
                      @{acc.platformUsername}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="block text-sm font-semibold text-gray-900 mb-4">
          When do you want to publish?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/50 transition-colors">
            <input
              type="radio"
              name="publishMode"
              checked={mode === "now"}
              onChange={() => setMode("now")}
              className="mt-0.5 size-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <span className="block font-medium text-gray-900">Post now</span>
              <span className="block text-sm text-gray-500 mt-0.5">
                Publish right away
              </span>
            </div>
          </label>
          <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/50 transition-colors">
            <input
              type="radio"
              name="publishMode"
              checked={mode === "scheduled"}
              onChange={() => setMode("scheduled")}
              className="mt-0.5 size-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <span className="block font-medium text-gray-900">
                Schedule for later
              </span>
              <span className="block text-sm text-gray-500 mt-0.5">
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
              placeholder="Pick date & time"
            />
          </div>
        )}
        <p className="mt-4 text-sm text-gray-500">
          {mode === "draft" ? (
            <span className="text-emerald-700 font-medium">Saving as draft — you can publish later from Posts.</span>
          ) : (
            <>
              Or{" "}
              <button
                type="button"
                onClick={() => setMode("draft")}
                className="font-medium text-emerald-600 hover:text-emerald-700"
              >
                save as draft
              </button>{" "}
              to finish later.
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-100">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={
            loading ||
            accounts.length === 0 ||
            (mode === "scheduled" && !scheduledAt)
          }
          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 shadow-lg transition-colors"
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
          className="rounded-xl border border-gray-200 bg-white px-6 py-3 font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

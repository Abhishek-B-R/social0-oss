"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { PostFormOptions } from "../PostFormOptions";

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
          placeholder="Write your post..."
          rows={6}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          required
        />
      </div>

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
          (mode === "scheduled" && !scheduledAt)
        }
      />
    </form>
  );
}

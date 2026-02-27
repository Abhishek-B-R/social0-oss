"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publishPost } from "@/app/actions/publish";

export function PublishButton({
  postId,
  disabled,
  label = "Publish now",
}: {
  postId: string;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePublish = async () => {
    setError(null);
    setLoading(true);
    const result = await publishPost(postId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (!result.success && result.results.some((r) => r.error)) {
      setError(result.results.find((r) => r.error)?.error ?? "Publish failed");
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handlePublish}
        disabled={disabled || loading}
        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 text-sm font-medium transition-colors"
      >
        {loading ? "Publishing…" : label}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 max-w-[280px] text-right" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}

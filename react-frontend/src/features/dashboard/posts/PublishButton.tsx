"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publishPost } from "@/actions/publish";
import { toast } from "sonner";

export function PublishButton({
  postId,
  publicationId,
  disabled,
  label = "Publish now",
}: {
  postId: string;
  /** When set, only this publication is retried (per-platform Retry). */
  publicationId?: string;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePublish = async () => {
    toast.dismiss();
    setLoading(true);
    const result = await publishPost(postId, undefined, publicationId);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (!result.success && result.results.some((r) => r.error)) {
      toast.error(
        result.results.find((r) => r.error)?.error ?? "Publish failed",
      );
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
    </div>
  );
}

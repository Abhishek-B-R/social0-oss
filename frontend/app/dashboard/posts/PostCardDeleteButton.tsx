"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePost } from "@/app/actions/posts";

export function PostCardDeleteButton({
  postId,
  status,
}: {
  postId: string;
  status: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isDraft = status === "draft";
  const title = isDraft
    ? "Delete this draft?"
    : "Delete this scheduled post?";
  const body = isDraft
    ? "This cannot be undone."
    : "This cannot be undone. The post will not be published.";

  const handleConfirm = async () => {
    setLoading(true);
    const result = await deletePost(postId);
    setLoading(false);
    if (result.success) {
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 hover:border-red-200 transition-colors"
      >
        Delete
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="rounded-2xl bg-white p-6 shadow-xl max-w-sm w-full mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-draft-title"
          >
            <h3 id="delete-draft-title" className="font-semibold text-gray-900">
              {title}
            </h3>
            <p className="mt-2 text-sm text-gray-600">{body}</p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

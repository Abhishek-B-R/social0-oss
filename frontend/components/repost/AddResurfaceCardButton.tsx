"use client";

import { useState } from "react";
import { AddResurfaceModal } from "./AddResurfaceModal";

type PublicationLike = { connectedAccountId: string; platform: string };

type AddResurfaceCardButtonProps = {
  postId: string;
  publishedAt: Date;
  publications: PublicationLike[];
};

export function AddResurfaceCardButton({
  postId,
  publishedAt,
  publications,
}: AddResurfaceCardButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
      >
        ♻️ Add Auto-Repost
      </button>
      {open && (
        <AddResurfaceModal
          postId={postId}
          publishedAt={publishedAt}
          publications={publications}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

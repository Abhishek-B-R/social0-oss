"use client";

import { useState } from "react";
import { AddAutoPlugModal } from "./AddAutoPlugModal";

type PublicationLike = {
  connectedAccountId: string;
  platform: string;
  profileImageUrl?: string | null;
  platformUsername?: string | null;
};

type AddAutoPlugCardButtonProps = {
  postId: string;
  publishedAt: Date;
  publications: PublicationLike[];
};

export function AddAutoPlugCardButton({
  postId,
  publishedAt,
  publications,
}: AddAutoPlugCardButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
      >
        Add Auto-Plug
      </button>
      {open && (
        <AddAutoPlugModal
          postId={postId}
          publishedAt={publishedAt}
          publications={publications}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

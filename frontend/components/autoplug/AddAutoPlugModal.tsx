"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAutoPlug } from "@/app/actions/resurface";
import { AutoPlugPanel, type AutoPlugConfig } from "./AutoPlugPanel";
import { RESURFACE_PLATFORMS } from "@/lib/resurface-utils";
import { toast } from "sonner";

type PublicationLike = {
  connectedAccountId: string;
  platform: string;
  profileImageUrl?: string | null;
  platformUsername?: string | null;
};

type AddAutoPlugModalProps = {
  postId: string;
  publishedAt: Date;
  publications: PublicationLike[];
  onClose: () => void;
};

export function AddAutoPlugModal({
  postId,
  publishedAt,
  publications,
  onClose,
}: AddAutoPlugModalProps) {
  const router = useRouter();
  const [config, setConfig] = useState<AutoPlugConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const supportedPubs = publications.filter((p) =>
    RESURFACE_PLATFORMS.includes(
      p.platform as (typeof RESURFACE_PLATFORMS)[number],
    ),
  );
  const xPub = supportedPubs.find((p) => p.platform === "twitter_x");

  const allAccounts = publications.map((p) => ({
    id: p.connectedAccountId,
    platform: p.platform,
    platformUsername: p.platformUsername ?? null,
    profileImageUrl: p.profileImageUrl ?? null,
  }));
  const selectedAccountIds = publications.map((p) => p.connectedAccountId);

  const handleSave = async () => {
    if (!config || !xPub) return;
    toast.dismiss();
    setSaving(true);
    const result = await createAutoPlug(
      postId,
      xPub.connectedAccountId,
      config,
    );
    setSaving(false);
    if (result.success) {
      onClose();
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to add Auto-Plug");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-autoplug-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2
            id="add-autoplug-title"
            className="text-lg font-semibold text-gray-900"
          >
            Add Auto-Plug
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>
        <div className="p-4">
          <AutoPlugPanel
            selectedAccountIds={selectedAccountIds}
            allAccounts={allAccounts}
            postId={postId}
            publishedAt={publishedAt}
            onChange={setConfig}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!config || !xPub || saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

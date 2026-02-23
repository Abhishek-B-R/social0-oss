"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createResurfaceSchedule } from "@/app/actions/resurface";
import { AutoResurfacePanel, type AutoResurfaceConfig } from "./AutoResurfacePanel";
import { RESURFACE_PLATFORMS } from "@/lib/resurface-utils";

type PublicationLike = { connectedAccountId: string; platform: string };

type AddResurfaceModalProps = {
  postId: string;
  publishedAt: Date;
  publications: PublicationLike[];
  onClose: () => void;
};

export function AddResurfaceModal({
  postId,
  publishedAt,
  publications,
  onClose,
}: AddResurfaceModalProps) {
  const router = useRouter();
  const [config, setConfig] = useState<AutoResurfaceConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supportedPubs = publications.filter((p) =>
    RESURFACE_PLATFORMS.includes(p.platform as (typeof RESURFACE_PLATFORMS)[number]),
  );
  const hasX = supportedPubs.some((p) => p.platform === "twitter_x");

  const allAccounts = publications.map((p) => ({
    id: p.connectedAccountId,
    platform: p.platform,
  }));
  const selectedAccountIds = publications.map((p) => p.connectedAccountId);

  const handleSave = async () => {
    if (!config || !hasX) return;
    setError(null);
    setSaving(true);
    const result = await createResurfaceSchedule(
      postId,
      "x",
      config.intervalHours,
      config.maxResurfaces,
      config.plugComment?.trim() || null,
    );
    setSaving(false);
    if (result.success) {
      onClose();
      router.refresh();
    } else {
      setError(result.error ?? "Failed to enable");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-resurface-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 id="add-resurface-title" className="text-lg font-semibold text-gray-900">
            ♻️ Add Auto-Repost
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
          <AutoResurfacePanel
            selectedAccountIds={selectedAccountIds}
            allAccounts={allAccounts}
            postId={postId}
            publishedAt={publishedAt}
            onChange={setConfig}
          />
          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
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
              disabled={!config || !hasX || saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

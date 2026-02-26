"use client";

import { TikTokSettingsCard } from "@/components/TikTokSettingsCard";

type TikTokSettingsCardAccount = {
  id: string;
  platform: string;
  platformUsername?: string | null;
};

type TikTokSettingsListModalProps = {
  isOpen: boolean;
  selectedAccountIds: string[];
  allAccounts: TikTokSettingsCardAccount[];
  configuredIds?: Set<string>;
  onOpenSettings: (accountId: string) => void;
  onClose: () => void;
};

export function TikTokSettingsListModal({
  isOpen,
  selectedAccountIds,
  allAccounts,
  configuredIds,
  onOpenSettings,
  onClose,
}: TikTokSettingsListModalProps) {
  if (!isOpen) return null;

  const handleOpen = (accountId: string) => {
    onOpenSettings(accountId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tiktok-settings-list-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-2xl border border-border bg-bg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 p-4 border-b border-border">
          <h2
            id="tiktok-settings-list-title"
            className="text-lg font-semibold text-text"
          >
            TikTok settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text rounded-lg p-1.5 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          <TikTokSettingsCard
            selectedAccountIds={selectedAccountIds}
            allAccounts={allAccounts}
            configuredIds={configuredIds}
            onOpenSettings={handleOpen}
          />
        </div>
      </div>
    </div>
  );
}

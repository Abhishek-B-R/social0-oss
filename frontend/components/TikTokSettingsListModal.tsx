"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const handleOpen = (accountId: string) => {
    onOpenSettings(accountId);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 border-border bg-bg"
        aria-labelledby="tiktok-settings-list-title"
      >
        <DialogHeader className="shrink-0 p-4 border-b border-border pb-4">
          <DialogTitle id="tiktok-settings-list-title" className="text-lg font-semibold text-text">
            TikTok settings
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-4 min-h-0">
          <TikTokSettingsCard
            selectedAccountIds={selectedAccountIds}
            allAccounts={allAccounts}
            configuredIds={configuredIds}
            onOpenSettings={handleOpen}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TikTokSettingsCard,
  type TikTokSettingsCardAccount,
} from "@/components/TikTokSettingsCard";

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
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 border-border bg-bg"
      >
        <DialogHeader className="shrink-0 p-4 border-b border-border pb-4">
          <DialogTitle className="text-lg font-semibold text-text">
            TikTok settings
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-4 min-h-0">
          <TikTokSettingsCard
            selectedAccountIds={selectedAccountIds}
            allAccounts={allAccounts}
            configuredIds={configuredIds}
            onOpenSettings={(accountId) => {
              onOpenSettings(accountId);
              onClose();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AutoPlugPanel, type AutoPlugConfig, type ConnectedAccount } from "./AutoPlugPanel";

type AutoPlugSettingsModalProps = {
  isOpen: boolean;
  selectedAccountIds: string[];
  allAccounts: ConnectedAccount[];
  initialConfig?: Partial<AutoPlugConfig> | null;
  onChange: (config: AutoPlugConfig | null) => void;
  onDone: () => void;
  onCancel: () => void;
};

export function AutoPlugSettingsModal({
  isOpen,
  selectedAccountIds,
  allAccounts,
  initialConfig,
  onChange,
  onDone,
  onCancel,
}: AutoPlugSettingsModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent
        className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 border-border bg-bg"
        aria-labelledby="auto-plug-settings-title"
      >
        <DialogHeader className="shrink-0 p-4 border-b border-border pb-4">
          <DialogTitle id="auto-plug-settings-title" className="text-lg font-semibold text-text">
            🔌 Auto-Plug settings
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-4 min-h-0">
          <AutoPlugPanel
            selectedAccountIds={selectedAccountIds}
            allAccounts={allAccounts}
            initialConfig={initialConfig}
            onChange={onChange}
            embedded
            modalMode
          />
        </div>

        <DialogFooter className="shrink-0 p-4 border-t border-border flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-medium text-text shadow-sm hover:bg-bg-subtle transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDone}
            className="flex-1 rounded-xl bg-accent hover:bg-accent-hover text-white px-4 py-2.5 text-sm font-semibold shadow-md transition-colors"
          >
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

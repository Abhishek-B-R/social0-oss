"use client";

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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-plug-settings-title"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="rounded-2xl border border-border bg-bg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 p-4 border-b border-border">
          <h2
            id="auto-plug-settings-title"
            className="text-lg font-semibold text-text"
          >
            🔌 Auto-Plug settings
          </h2>
          <button
            type="button"
            onClick={onCancel}
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
          <AutoPlugPanel
            selectedAccountIds={selectedAccountIds}
            allAccounts={allAccounts}
            initialConfig={initialConfig}
            onChange={onChange}
            embedded
            modalMode
          />
        </div>

        <div className="shrink-0 p-4 border-t border-border flex gap-3">
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
        </div>
      </div>
    </div>
  );
}

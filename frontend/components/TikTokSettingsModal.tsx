"use client";

import { useState, useEffect } from "react";
import {
  TikTokSettings,
  type TikTokPostSettings,
} from "@/components/TikTokSettings";

type TikTokSettingsModalProps = {
  isOpen: boolean;
  accountId: string;
  accountUsername?: string | null;
  value: TikTokPostSettings;
  onChange: (settings: TikTokPostSettings) => void;
  onSave: () => void;
  onClose: () => void;
  /** When set, show inline in modal and do not allow close on save until fixed */
  validationError?: string | null;
  /** When "photo", only Allow Comments is shown (Duet/Stitch do not apply to photo posts). */
  mediaType?: "video" | "photo";
};

export function TikTokSettingsModal({
  isOpen,
  accountId,
  accountUsername,
  value,
  onChange,
  onSave,
  onClose,
  validationError = null,
  mediaType,
}: TikTokSettingsModalProps) {
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (validationError) setLocalValidation(validationError);
    else setLocalValidation(null);
  }, [validationError]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!value.privacy_level?.trim()) {
      setLocalValidation("Please select a privacy level.");
      return;
    }
    if (
      value.brand_content_toggle &&
      !value.brand_organic &&
      !value.brand_content
    ) {
      setLocalValidation(
        "Select at least one option (Your brand or Branded content) when promoting a brand.",
      );
      return;
    }
    if (value.brand_content && value.privacy_level === "SELF_ONLY") {
      setLocalValidation(
        "Branded content cannot be set to private. Please select Public or Friends.",
      );
      return;
    }
    setLocalValidation(null);
    onSave();
  };

  const displayError = localValidation || validationError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tiktok-settings-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-2xl border border-gray-200 bg-white shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 p-4 border-b border-gray-100">
          <h2
            id="tiktok-settings-title"
            className="text-lg font-semibold text-gray-900"
          >
            TikTok settings
            {accountUsername && (
              <span className="text-gray-500 font-normal ml-1">
                @{accountUsername}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 transition-colors"
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
          <TikTokSettings
            accountId={accountId}
            value={value}
            onChange={(s) => {
              setLocalValidation(null);
              onChange(s);
            }}
            mediaType={mediaType}
          />
        </div>

        <div className="shrink-0 p-4 border-t border-gray-100 space-y-3">
          {displayError && (
            <p className="text-sm text-red-600 font-medium" role="alert">
              {displayError}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-semibold shadow-md transition-colors"
            >
              Save settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

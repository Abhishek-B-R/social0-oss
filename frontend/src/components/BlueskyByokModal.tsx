import { fetchApi } from "@/lib/fetch-api";
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

type BlueskyByokModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (username: string) => void;
};

const backdropClass =
  "fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-md";

export function BlueskyByokModal({
  isOpen,
  onClose,
  onSuccess,
}: BlueskyByokModalProps) {
  const [formData, setFormData] = useState({
    handle: "",
    appPassword: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    toast.dismiss();

    try {
      const response = await fetchApi("/api/connect/bluesky/byok", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Failed to connect Bluesky account",
        );
      }

      // Success - close modal and refresh
      onSuccess(data.username || "user");
      onClose();
      // Reload page to show updated connection status
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange =
    (field: keyof typeof formData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

  return createPortal(
    <div
      className={backdropClass}
      role="presentation"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="mx-4 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bluesky-connect-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="bluesky-connect-title"
            className="text-xl font-bold text-gray-900 dark:text-gray-100"
          >
            Connect Bluesky
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            disabled={isSubmitting}
            aria-label="Close"
          >
            <svg
              className="h-6 w-6"
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

        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Requires your handle and an App Password. Do not use your main
          password. Generate an App Password in Bluesky Settings → App
          Passwords.
        </p>
        <a
          href="https://bsky.app/settings/app-passwords"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-block text-sm font-medium text-emerald-600 hover:underline"
        >
          bsky.app/settings/app-passwords →
        </a>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="handle"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Bluesky Handle
            </label>
            <input
              id="handle"
              type="text"
              value={formData.handle}
              onChange={handleChange("handle")}
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="@username.bsky.social"
            />
            <p className="mt-1 text-xs text-gray-500">
              Format: @username.bsky.social or username.bsky.social
            </p>
          </div>

          <div>
            <label
              htmlFor="appPassword"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              App Password
            </label>
            <input
              id="appPassword"
              type="password"
              value={formData.appPassword}
              onChange={handleChange("appPassword")}
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="xxxx-xxxx-xxxx-xxxx"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

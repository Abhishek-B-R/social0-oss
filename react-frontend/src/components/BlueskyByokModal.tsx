"use client";
import { fetchApi } from "@/lib/fetch-api";

import { useState } from "react";
import { toast } from "sonner";

type BlueskyByokModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (username: string) => void;
};

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Connect Bluesky</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1"
            disabled={isSubmitting}
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
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

        <p className="text-sm text-gray-600 mb-4">
          Requires your handle and an App Password. Do not use your main
          password. Generate an App Password in Bluesky Settings → App
          Passwords.
        </p>
        <a
          href="https://bsky.app/settings/app-passwords"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-emerald-600 hover:underline font-medium mb-4 inline-block"
        >
          bsky.app/settings/app-passwords →
        </a>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="handle"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Bluesky Handle
            </label>
            <input
              id="handle"
              type="text"
              value={formData.handle}
              onChange={handleChange("handle")}
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="@username.bsky.social"
            />
            <p className="mt-1 text-xs text-gray-500">
              Format: @username.bsky.social or username.bsky.social
            </p>
          </div>

          <div>
            <label
              htmlFor="appPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              App Password
            </label>
            <input
              id="appPassword"
              type="password"
              value={formData.appPassword}
              onChange={handleChange("appPassword")}
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="xxxx-xxxx-xxxx-xxxx"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-semibold shadow-md disabled:opacity-50"
            >
              {isSubmitting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

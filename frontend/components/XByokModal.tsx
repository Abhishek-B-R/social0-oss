"use client";

import { useState } from "react";

type XByokModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (username: string) => void;
};

export function XByokModal({ isOpen, onClose, onSuccess }: XByokModalProps) {
  const [formData, setFormData] = useState({
    consumerKey: "",
    consumerSecret: "",
    accessToken: "",
    accessTokenSecret: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/connect/twitter_x/byok", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to connect X account");
      }

      // Success - close modal and refresh
      onSuccess(data.username || "user");
      onClose();
      // Reload page to show updated connection status
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Connect X (Twitter) Account
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            disabled={isSubmitting}
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

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enter your X API credentials. Get these from{" "}
          <a
            href="https://console.x.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            https://console.x.com
          </a>{" "}
          → Your App → Keys and Tokens
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="consumerKey"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              API Key (Consumer Key)
            </label>
            <input
              id="consumerKey"
              type="text"
              value={formData.consumerKey}
              onChange={handleChange("consumerKey")}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your API Key"
            />
          </div>

          <div>
            <label
              htmlFor="consumerSecret"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              API Secret (Consumer Secret)
            </label>
            <input
              id="consumerSecret"
              type="password"
              value={formData.consumerSecret}
              onChange={handleChange("consumerSecret")}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your API Secret"
            />
          </div>

          <div>
            <label
              htmlFor="accessToken"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Access Token
            </label>
            <input
              id="accessToken"
              type="password"
              value={formData.accessToken}
              onChange={handleChange("accessToken")}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your Access Token"
            />
          </div>

          <div>
            <label
              htmlFor="accessTokenSecret"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Access Token Secret
            </label>
            <input
              id="accessTokenSecret"
              type="password"
              value={formData.accessTokenSecret}
              onChange={handleChange("accessTokenSecret")}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your Access Token Secret"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

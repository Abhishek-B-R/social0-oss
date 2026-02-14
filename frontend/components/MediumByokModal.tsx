"use client";

import { useState } from "react";

type MediumByokModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (username: string) => void;
};

export function MediumByokModal({ isOpen, onClose, onSuccess }: MediumByokModalProps) {
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/medium/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationToken: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to connect");
      onSuccess(data.username ?? "user");
      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Connect Medium</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
          Medium&apos;s API has limited support. You can publish new articles but cannot edit or delete them after publishing.
        </p>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 mb-4">
          <li>Go to Medium → Settings → Security and apps → Integration tokens</li>
          <li>Generate or copy your integration token</li>
          <li>Paste it below</li>
        </ol>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="medium-token" className="block text-sm font-medium text-gray-700 mb-1">Integration token</label>
            <input
              id="medium-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your token"
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          {error && (
            <p className="text-sm font-medium text-red-600">{error}</p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-semibold shadow-md disabled:opacity-50">
              {isSubmitting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

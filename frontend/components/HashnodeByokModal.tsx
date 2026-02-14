"use client";

import { useState } from "react";

type HashnodeByokModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (username: string) => void;
};

export function HashnodeByokModal({ isOpen, onClose, onSuccess }: HashnodeByokModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [publicationId, setPublicationId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/hashnode/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          publicationId: publicationId.trim(),
        }),
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
          <h2 className="text-xl font-bold text-gray-900">Connect Hashnode</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 mb-4">
          <li>Go to Hashnode Settings → Developer</li>
          <li>Generate a Personal Access Token</li>
          <li>Find your Publication ID in your blog dashboard URL</li>
        </ol>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="hashnode-api-key" className="block text-sm font-medium text-gray-700 mb-1">API key</label>
            <input
              id="hashnode-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your token"
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label htmlFor="hashnode-publication-id" className="block text-sm font-medium text-gray-700 mb-1">Publication ID</label>
            <input
              id="hashnode-publication-id"
              type="text"
              value={publicationId}
              onChange={(e) => setPublicationId(e.target.value)}
              placeholder="From hashnode.com/&lt;publication_id&gt;/dashboard"
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

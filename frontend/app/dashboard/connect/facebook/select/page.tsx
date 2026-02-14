"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Page = { id: string; name: string };

export default function FacebookSelectPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const loadPages = useCallback(async () => {
    if (!token) {
      setError("Missing token");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/connect/facebook/select?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load pages");
      setPages(data.pages || []);
      if (data.pages?.length) setSelectedId(data.pages[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pages");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/facebook/connect-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId: token, pageId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect page");
      window.location.href = "/dashboard?connected=facebook";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-gray-600 font-medium">Loading your Facebook Pages...</p>
      </div>
    );
  }

  if (error && pages.length === 0) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-800">{error}</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
        Choose a Facebook Page
      </h2>
      <p className="text-gray-500 mb-6 font-medium">
        Select the Page you want to connect to Social0.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          {pages.map((page) => (
            <label
              key={page.id}
              className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white cursor-pointer hover:bg-gray-50 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/50"
            >
              <input
                type="radio"
                name="pageId"
                value={page.id}
                checked={selectedId === page.id}
                onChange={() => setSelectedId(page.id)}
                className="size-4 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium text-gray-900">{page.name}</span>
            </label>
          ))}
        </div>
        {error && (
          <p className="text-sm font-medium text-red-600">{error}</p>
        )}
        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 font-semibold shadow-lg disabled:opacity-50"
          >
            {submitting ? "Connecting..." : "Connect Page"}
          </button>
        </div>
      </form>
    </div>
  );
}

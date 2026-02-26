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
      <div className="rounded-2xl border border-border bg-bg-elevated p-8 shadow-sm">
        <p className="text-text-muted font-medium">Loading your Facebook Pages...</p>
      </div>
    );
  }

  if (error && pages.length === 0) {
    return (
      <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-6">
        <p className="font-medium text-destructive">{error}</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-accent hover:text-accent-hover"
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <h2 className="text-2xl font-extrabold text-text mb-2">
        Choose a Facebook Page
      </h2>
      <p className="text-text-muted mb-6 font-medium">
        Select the Page you want to connect to Social0.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          {pages.map((page) => (
            <label
              key={page.id}
              className="flex items-center gap-3 p-4 rounded-xl border border-border bg-bg-elevated cursor-pointer hover:bg-bg-subtle has-[:checked]:border-accent has-[:checked]:bg-accent/10"
            >
              <input
                type="radio"
                name="pageId"
                value={page.id}
                checked={selectedId === page.id}
                onChange={() => setSelectedId(page.id)}
                className="size-4 text-accent focus:ring-accent"
              />
              <span className="font-medium text-text">{page.name}</span>
            </label>
          ))}
        </div>
        {error && (
          <p className="text-sm font-medium text-destructive">{error}</p>
        )}
        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl border border-border bg-bg-elevated px-5 py-2.5 font-medium text-text shadow-sm hover:bg-bg-subtle"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-accent hover:bg-accent-hover text-white px-5 py-2.5 font-semibold shadow-lg disabled:opacity-50"
          >
            {submitting ? "Connecting..." : "Connect Page"}
          </button>
        </div>
      </form>
    </div>
  );
}

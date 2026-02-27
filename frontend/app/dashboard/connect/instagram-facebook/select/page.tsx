"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type InstagramPage = {
  pageId: string;
  pageName: string;
  instagramAccountId: string;
  instagramUsername: string | null;
  instagramProfilePictureUrl: string | null;
};

export default function InstagramFacebookSelectPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [pages, setPages] = useState<InstagramPage[]>([]);
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
      const res = await fetch(
        `/api/connect/instagram-facebook/select?token=${encodeURIComponent(token)}`,
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to load Instagram accounts");
      setPages(data.pages || []);
      if (data.pages?.length) setSelectedId(data.pages[0].instagramAccountId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load Instagram accounts",
      );
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
      const res = await fetch("/api/connect/instagram-facebook/connect-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: token,
          instagramAccountId: selectedId,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to connect Instagram account");
      window.location.href = "/dashboard?connected=instagram";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-bg-elevated p-8 shadow-sm">
        <p className="text-text-muted font-medium">
          Loading your Instagram accounts...
        </p>
      </div>
    );
  }

  if (error && pages.length === 0) {
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/40 p-6">
        <p className="font-medium text-red-800 dark:text-red-200">{error}</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <h2 className="text-2xl font-extrabold text-text mb-2">
        Choose an Instagram Account
      </h2>
      <p className="text-text-muted mb-6 font-medium">
        Select the Instagram account you want to connect to Social0.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          {pages.map((page) => (
            <label
              key={page.instagramAccountId}
              className="flex items-center gap-3 p-4 rounded-xl border border-border bg-bg-elevated cursor-pointer hover:bg-bg-subtle has-checked:border-accent has-checked:bg-accent/10"
            >
              <input
                type="radio"
                name="instagramAccountId"
                value={page.instagramAccountId}
                checked={selectedId === page.instagramAccountId}
                onChange={() => setSelectedId(page.instagramAccountId)}
                className="size-4 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="flex items-center gap-3 flex-1">
                {page.instagramProfilePictureUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={page.instagramProfilePictureUrl}
                    alt={page.instagramUsername || "Instagram"}
                    className="w-10 h-10 rounded-full"
                  />
                )}
                <div className="flex-1">
                  <div className="font-medium text-text">
                    @{page.instagramUsername || "instagram"}
                  </div>
                  <div className="text-xs text-text-muted">
                    via {page.pageName}
                  </div>
                </div>
              </div>
            </label>
          ))}
        </div>
        {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
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
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 font-semibold shadow-lg disabled:opacity-50"
          >
            {submitting ? "Connecting..." : "Connect Instagram"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Page = {
  pageId: string;
  pageName: string;
  instagramAccountId: string;
  instagramUsername: string | null;
  instagramProfilePictureUrl: string | null;
};

export default function InstagramFacebookSelectPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const returnTo =
    searchParams.get("returnTo") ?? "/dashboard/connections";

  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing token");
      setLoading(false);
      return;
    }
    fetch(`/api/connect/instagram-facebook/select?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d.error ?? "Failed to load pages")));
        return res.json();
      })
      .then((data) => {
        setPages(data.pages ?? []);
      })
      .catch((err) => {
        setError(err.message ?? "Failed to load pages");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleSelect = useCallback(
    async (pageId: string) => {
      if (!token) return;
      setSubmitting(pageId);
      try {
        const res = await fetch("/api/connect/instagram-facebook/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, pageId, returnTo }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to connect");
        }
        window.location.href = res.url;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect");
        setSubmitting(null);
      }
    },
    [token, returnTo],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-text-muted">Loading pages…</p>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-red-500">{error ?? "Invalid link"}</p>
        <Link
          href={returnTo}
          className="rounded-lg border border-border bg-bg px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle"
        >
          Back
        </Link>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-text-muted">No pages with Instagram found.</p>
        <Link
          href={returnTo}
          className="rounded-lg border border-border bg-bg px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle"
        >
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <h1 className="text-2xl font-bold text-text">
        Choose a Facebook Page
      </h1>
      <p className="text-sm text-text-muted">
        Select the Page linked to the Instagram account you want to connect.
      </p>
      <div className="space-y-2">
        {pages.map((page) => (
          <button
            key={page.pageId}
            type="button"
            onClick={() => handleSelect(page.pageId)}
            disabled={submitting !== null}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-bg-elevated p-4 text-left transition-colors hover:bg-bg-muted disabled:opacity-50"
          >
            {page.instagramProfilePictureUrl ? (
              <img
                src={page.instagramProfilePictureUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-full bg-bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text">{page.pageName}</p>
              {page.instagramUsername && (
                <p className="text-sm text-text-muted">
                  @{page.instagramUsername}
                </p>
              )}
            </div>
            {submitting === page.pageId ? (
              <span className="text-sm text-text-muted">Connecting…</span>
            ) : (
              <span className="text-sm font-medium text-primary">Connect</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-center">
        <Link
          href={returnTo}
          className="text-sm text-text-muted underline hover:no-underline"
        >
          Cancel and go back
        </Link>
      </p>
    </div>
  );
}

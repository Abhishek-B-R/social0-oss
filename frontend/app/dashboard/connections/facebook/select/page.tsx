"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AccountPicker, type AccountPickerAccount } from "@/components/AccountPicker";

export default function FacebookSelectPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const returnTo =
    searchParams.get("returnTo") ?? "/dashboard/connections";

  const [accounts, setAccounts] = useState<AccountPickerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing token");
      setLoading(false);
      return;
    }
    fetch(`/api/connect/facebook/select?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok)
          return res.json().then((d) => Promise.reject(new Error(d.error ?? "Failed to load pages")));
        return res.json();
      })
      .then((data) => {
        setAccounts(
          (data.pages ?? []).map((p: { id: string; name: string; pictureUrl?: string | null }) => ({
            id: p.id,
            name: p.name,
            pictureUrl: p.pictureUrl ?? null,
          })),
        );
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
      setError(null);
      setSubmitLoading(true);
      try {
        const res = await fetch("/api/connect/facebook/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, pageId, returnTo }),
          redirect: "follow",
        });
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          setError(
            data.message ?? "You need an active plan to connect accounts and post content.",
          );
          setSubmitLoading(false);
          return;
        }
        if (res.redirected) {
          window.location.href = res.url;
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (data.error) {
          setError(data.message ?? data.error);
        } else {
          window.location.href = returnTo;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setSubmitLoading(false);
      }
    },
    [token, returnTo],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">Loading pages…</p>
      </div>
    );
  }

  if (error && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-destructive">{error}</p>
        <Link
          href={returnTo}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Back to connections
        </Link>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">No Facebook Pages found.</p>
        <Link
          href={returnTo}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Back to connections
        </Link>
      </div>
    );
  }

  return (
    <AccountPicker
      accounts={accounts}
      title="Connect a Facebook Page"
      subtitle="Select a page to connect:"
      submitLabel="Connect Selected Page"
      onSelect={handleSelect}
      loading={submitLoading}
      error={error}
    />
  );
}

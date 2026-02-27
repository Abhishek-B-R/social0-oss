"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Privacy = "PUBLIC" | "PRIVATE";

export default function PinterestCreateBoardPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [name, setName] = useState("Test Board");
  const [privacy, setPrivacy] = useState<Privacy>("PUBLIC");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing token");
    }
    setLoading(false);
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/pinterest/create-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: token,
          name: name.trim(),
          privacy,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create board");
      window.location.href = "/dashboard/connections?connected=pinterest";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create board");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-bg-elevated p-8 shadow-sm">
        <p className="text-text-muted font-medium">
          Preparing Pinterest board setup...
        </p>
      </div>
    );
  }

  if (error && !token) {
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
        Create at least one board on Pinterest first
      </h2>
      <p className="text-text-muted mb-6 font-medium">
        You don&apos;t have any boards yet (sandbox). Create one now, then
        choose which board should be the default for posts.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-text mb-2">
            Board name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            placeholder="e.g. Test Board"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-text mb-2">
            Privacy
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-bg px-4 py-3 cursor-pointer has-checked:border-accent has-checked:bg-accent/10">
              <input
                type="radio"
                name="privacy"
                value="PUBLIC"
                checked={privacy === "PUBLIC"}
                onChange={() => setPrivacy("PUBLIC")}
                className="size-4 text-accent focus:ring-accent"
              />
              <span className="font-medium text-text">Public</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-bg px-4 py-3 cursor-pointer has-checked:border-accent has-checked:bg-accent/10">
              <input
                type="radio"
                name="privacy"
                value="PRIVATE"
                checked={privacy === "PRIVATE"}
                onChange={() => setPrivacy("PRIVATE")}
                className="size-4 text-accent focus:ring-accent"
              />
              <span className="font-medium text-text">Private</span>
            </label>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl border border-border bg-bg px-5 py-2.5 font-medium text-text shadow-sm hover:bg-bg-subtle"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-xl bg-accent hover:bg-accent-hover text-white px-5 py-2.5 font-semibold shadow-lg disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create board"}
          </button>
        </div>
      </form>
    </div>
  );
}

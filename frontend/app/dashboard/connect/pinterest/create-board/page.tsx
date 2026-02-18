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
      window.location.href = `/dashboard/connect/pinterest/select?token=${encodeURIComponent(token)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create board");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-gray-600 font-medium">
          Preparing Pinterest board setup...
        </p>
      </div>
    );
  }

  if (error && !token) {
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
        Create at least one board on Pinterest first
      </h2>
      <p className="text-gray-500 mb-6 font-medium">
        You don&apos;t have any boards yet (sandbox). Create one now, then
        choose which board should be the default for posts.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Board name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="e.g. Test Board"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Privacy
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 cursor-pointer has-checked:border-emerald-500 has-checked:bg-emerald-50/50">
              <input
                type="radio"
                name="privacy"
                value="PUBLIC"
                checked={privacy === "PUBLIC"}
                onChange={() => setPrivacy("PUBLIC")}
                className="size-4 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium text-gray-900">Public</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 cursor-pointer has-checked:border-emerald-500 has-checked:bg-emerald-50/50">
              <input
                type="radio"
                name="privacy"
                value="PRIVATE"
                checked={privacy === "PRIVATE"}
                onChange={() => setPrivacy("PRIVATE")}
                className="size-4 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium text-gray-900">Private</span>
            </label>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 font-semibold shadow-lg disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create board"}
          </button>
        </div>
      </form>
    </div>
  );
}

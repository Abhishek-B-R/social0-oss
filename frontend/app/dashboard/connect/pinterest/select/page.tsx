"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Board = { id: string; name: string };

export default function PinterestSelectPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const loadBoards = useCallback(async () => {
    if (!token) {
      setError("Missing token");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/connect/pinterest/select?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load boards");
      setBoards(data.boards || []);
      if (data.boards?.length) setSelectedId(data.boards[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load boards");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/pinterest/connect-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId: token, boardId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect board");
      window.location.href = "/dashboard?connected=pinterest";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-bg-elevated p-8 shadow-sm">
        <p className="text-text-muted font-medium">Loading your Pinterest boards...</p>
      </div>
    );
  }

  if (error && boards.length === 0) {
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
        Choose default board for posts
      </h2>
      <p className="text-text-muted mb-6 font-medium">
        Select the board where your Pinterest posts will be published.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          {boards.map((board) => (
            <label
              key={board.id}
              className="flex items-center gap-3 p-4 rounded-xl border border-border bg-bg-elevated cursor-pointer hover:bg-bg-subtle has-checked:border-accent has-checked:bg-accent/10"
            >
              <input
                type="radio"
                name="boardId"
                value={board.id}
                checked={selectedId === board.id}
                onChange={() => setSelectedId(board.id)}
                className="size-4 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium text-text">{board.name}</span>
            </label>
          ))}
        </div>
        {error && (
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
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
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 font-semibold shadow-lg disabled:opacity-50"
          >
            {submitting ? "Connecting..." : "Connect Board"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getRememberedBoard,
  setRememberedBoard,
  getRememberedLink,
  setRememberedLink,
  savePinterestDefaultBoardToDb,
} from "@/lib/pinterest-remembered";

export type PinterestPostSettings = {
  boardId: string;
  title: string;
  link: string;
  rememberBoard: boolean;
  rememberLink: boolean;
};

type Board = { id: string; name: string };

type PinterestSettingsProps = {
  /** First account used to fetch boards; when multiple Pinterest accounts selected, same board is used for all. */
  accountId: string;
  value: PinterestPostSettings;
  onChange: (settings: PinterestPostSettings) => void;
};

const PINTEREST_TITLE_MAX = 100;

export function PinterestSettings({
  accountId,
  value,
  onChange,
}: PinterestSettingsProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPrivacy, setCreatePrivacy] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const fetchBoards = useCallback(async () => {
    if (!accountId) {
      setBoards([]);
      setBoardsLoading(false);
      return;
    }
    setBoardsLoading(true);
    setBoardsError(null);
    try {
      const res = await fetch(
        `/api/pinterest/boards?accountId=${encodeURIComponent(accountId)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBoardsError(data.error ?? "Failed to load boards");
        setBoards([]);
        return;
      }
      setBoards(data.boards ?? []);
    } catch {
      setBoardsError("Failed to load boards");
      setBoards([]);
    } finally {
      setBoardsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const handleRememberBoardChange = (checked: boolean) => {
    const next = { ...value, rememberBoard: checked };
    if (checked && value.boardId) {
      setRememberedBoard(accountId, value.boardId);
    }
    onChange(next);
  };

  const handleRememberLinkChange = (checked: boolean) => {
    const next = { ...value, rememberLink: checked };
    if (checked && value.link) {
      setRememberedLink(accountId, value.link);
    }
    onChange(next);
  };

  const handleBoardChange = (boardId: string) => {
    const next = { ...value, boardId };
    if (value.rememberBoard) {
      setRememberedBoard(accountId, boardId);
    }
    if (boardId) {
      savePinterestDefaultBoardToDb(accountId, boardId);
    }
    onChange(next);
  };

  const handleLinkChange = (link: string) => {
    const next = { ...value, link };
    if (value.rememberLink) {
      setRememberedLink(accountId, link);
    }
    onChange(next);
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreateSubmitting(true);
    try {
      const res = await fetch("/api/pinterest/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          name: createName.trim(),
          privacy: createPrivacy,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create board");
      await fetchBoards();
      if (data.board?.id) {
        handleBoardChange(data.board.id);
        if (value.rememberBoard) setRememberedBoard(accountId, data.board.id);
      }
      setCreateBoardOpen(false);
      setCreateName("");
      setCreatePrivacy("PUBLIC");
    } catch (err) {
      setBoardsError(err instanceof Error ? err.message : "Failed to create board");
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text mb-1">
          Pinterest Post Settings
        </h3>
        <p className="text-xs text-text-muted mt-1">
          Board and optional pin details
        </p>
      </div>

      {/* Board */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="block text-sm font-medium text-text">
            Board <span className="text-destructive">*</span>
          </label>
          <span className="rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium">
            required
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={value.boardId}
            onChange={(e) => handleBoardChange(e.target.value)}
            disabled={boardsLoading}
            className="flex-1 min-w-[200px] rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
          >
            <option value="">Select a board</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCreateBoardOpen(true)}
            className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm font-medium text-text shadow-sm hover:bg-bg-subtle"
          >
            + Create a new board
          </button>
        </div>
        {boardsError && (
          <p className="mt-1 text-xs text-destructive">{boardsError}</p>
        )}
        <p className="mt-1 text-xs text-text-muted">
          This is the board your post will be posted to. Only public boards can
          receive pins from this app.
        </p>
        <label className="mt-2 flex items-center gap-3">
          <input
            type="checkbox"
            checked={value.rememberBoard}
            onChange={(e) => handleRememberBoardChange(e.target.checked)}
            className="rounded border-border text-accent focus:ring-accent size-4"
          />
          <span className="text-sm text-text">Remember board for this account</span>
        </label>
      </div>

      {/* Pinterest Title */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="block text-sm font-medium text-text">
            Pinterest Title
          </label>
          <span className="rounded bg-muted text-text-muted px-2 py-0.5 text-xs font-medium">
            optional
          </span>
        </div>
        <input
          type="text"
          value={value.title}
          onChange={(e) =>
            onChange({ ...value, title: e.target.value.slice(0, PINTEREST_TITLE_MAX) })
          }
          maxLength={PINTEREST_TITLE_MAX}
          placeholder="Title for your pin"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <p className="mt-1 text-xs text-text-muted">
          Title for your Pinterest pin (max {PINTEREST_TITLE_MAX} characters). If
          not provided, uses first {PINTEREST_TITLE_MAX} characters of caption.
        </p>
      </div>

      {/* Pinterest Link */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="block text-sm font-medium text-text">
            Pinterest Link
          </label>
          <span className="rounded bg-muted text-text-muted px-2 py-0.5 text-xs font-medium">
            optional
          </span>
        </div>
        <input
          type="url"
          value={value.link}
          onChange={(e) => handleLinkChange(e.target.value)}
          placeholder="Enter your link here"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <p className="mt-1 text-xs text-text-muted">
          On Pinterest, you can provide a unique link users can click on when
          viewing your post.
        </p>
        <label className="mt-2 flex items-center gap-3">
          <input
            type="checkbox"
            checked={value.rememberLink}
            onChange={(e) => handleRememberLinkChange(e.target.checked)}
            className="rounded border-border text-accent focus:ring-accent size-4"
          />
          <span className="text-sm text-text">Remember link for this account</span>
        </label>
      </div>

      {createBoardOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-board-title"
        >
          <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl w-full max-w-md mx-4">
            <h2 id="create-board-title" className="text-lg font-semibold text-text mb-4">
              Create a new board
            </h2>
            <form onSubmit={handleCreateBoard} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Board name
                </label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"
                  placeholder="e.g. My Board"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Privacy
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="create-privacy"
                      checked={createPrivacy === "PUBLIC"}
                      onChange={() => setCreatePrivacy("PUBLIC")}
                      className="size-4 text-accent"
                    />
                    <span className="text-sm text-text">Public</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="create-privacy"
                      checked={createPrivacy === "PRIVATE"}
                      onChange={() => setCreatePrivacy("PRIVATE")}
                      className="size-4 text-accent"
                    />
                    <span className="text-sm text-text">Private</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateBoardOpen(false);
                    setCreateName("");
                  }}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting || !createName.trim()}
                  className="rounded-lg bg-accent text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {createSubmitting ? "Creating..." : "Create board"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

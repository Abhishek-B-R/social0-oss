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

type PinterestSettingsModalProps = {
  isOpen: boolean;
  accountId: string;
  accountUsername?: string | null;
  value: PinterestPostSettings;
  onChange: (settings: PinterestPostSettings) => void;
  onSave: () => void;
  onClose: () => void;
};

const PINTEREST_TITLE_MAX = 100;

export function PinterestSettingsModal({
  isOpen,
  accountId,
  accountUsername,
  value,
  onChange,
  onSave,
  onClose,
}: PinterestSettingsModalProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [createBoardInline, setCreateBoardInline] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const fetchBoards = useCallback(async () => {
    if (!accountId || !isOpen) {
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
  }, [accountId, isOpen]);

  useEffect(() => {
    if (isOpen) fetchBoards();
  }, [isOpen, fetchBoards]);

  // Pre-fill board and link from localStorage when modal opens
  useEffect(() => {
    if (!isOpen || !accountId) return;
    const savedBoard = getRememberedBoard(accountId);
    const savedLink = getRememberedLink(accountId);
    if (savedBoard && !value.boardId) {
      onChange({ ...value, boardId: savedBoard });
    }
    if (savedLink != null && savedLink !== "" && !value.link) {
      onChange({ ...value, link: savedLink });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when modal opens for this account
  }, [isOpen, accountId]);

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
    setBoardsError(null);
    try {
      const res = await fetch("/api/pinterest/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          name: createName.trim(),
          privacy: "PUBLIC",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create board");

      const newBoard = {
        id: data.board.id,
        name: data.board.name ?? createName.trim(),
      };

      setBoards((prev) => [...prev, newBoard]);
      handleBoardChange(newBoard.id);
      if (value.rememberBoard) setRememberedBoard(accountId, newBoard.id);

      setCreateName("");
      setCreateBoardInline(false);
    } catch (err) {
      setBoardsError(err instanceof Error ? err.message : "Failed to create board");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleSave = () => {
    if (!value.boardId?.trim()) return;
    if (value.rememberBoard) setRememberedBoard(accountId, value.boardId);
    if (value.rememberLink && value.link) setRememberedLink(accountId, value.link);
    onSave();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pinterest-settings-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-2xl border border-border bg-bg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 p-4 border-b border-border">
          <h2
            id="pinterest-settings-title"
            className="text-lg font-semibold text-text"
          >
            Pinterest settings
            {accountUsername && (
              <span className="text-text-muted font-normal ml-1">
                @{accountUsername}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text rounded-lg p-1.5 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-6">
          {/* Board (required) */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-sm font-medium text-text">
                Board <span className="text-destructive">*</span>
              </label>
              <span className="rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium">
                required
              </span>
            </div>
            <select
              value={value.boardId}
              onChange={(e) => handleBoardChange(e.target.value)}
              disabled={boardsLoading}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
            >
              <option value="">Select a board</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <div className="mt-2">
              {!createBoardInline ? (
                <button
                  type="button"
                  onClick={() => setCreateBoardInline(true)}
                  className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm font-medium text-text shadow-sm hover:bg-bg-subtle"
                >
                  + Create a new board
                </button>
              ) : (
                <form onSubmit={handleCreateBoard} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Board name"
                    className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text w-full min-w-[180px] flex-1"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={createSubmitting || !createName.trim()}
                    className="rounded-lg bg-accent text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {createSubmitting ? "Creating..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreateBoardInline(false); setCreateName(""); }}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
            {boardsError && (
              <p className="mt-1 text-xs text-destructive">{boardsError}</p>
            )}
            <p className="mt-1 text-xs text-text-muted">
              This is the board your post will be posted to.
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

          {/* Pinterest Title (optional) */}
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
              Title for your Pinterest pin (max {PINTEREST_TITLE_MAX} characters). If not
              provided, uses first {PINTEREST_TITLE_MAX} characters of caption.
            </p>
          </div>

          {/* Pinterest Link (optional) */}
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
        </div>

        <div className="shrink-0 p-4 border-t border-border">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-medium text-text shadow-sm hover:bg-bg-subtle transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!value.boardId?.trim()}
              className="flex-1 rounded-xl bg-accent hover:bg-accent-hover text-white px-4 py-2.5 text-sm font-semibold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

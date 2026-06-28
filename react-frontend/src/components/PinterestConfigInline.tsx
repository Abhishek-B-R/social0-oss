"use client";
import { fetchApi } from "@/lib/fetch-api";

import { useState, useEffect, useCallback } from "react";
import {
  getRememberedBoard,
  setRememberedBoard,
  getRememberedLink,
  setRememberedLink,
  savePinterestDefaultBoardToDb,
} from "@/lib/pinterest-remembered";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";

type Board = { id: string; name: string };

type PinterestConfigInlineProps = {
  accountId: string;
  value: PinterestPostSettings;
  onChange: (settings: PinterestPostSettings) => void;
  /** When true, fetch boards and pre-fill from localStorage */
  isVisible?: boolean;
};

const PINTEREST_TITLE_MAX = 100;

export function PinterestConfigInline({
  accountId,
  value,
  onChange,
  isVisible = true,
}: PinterestConfigInlineProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [createBoardInline, setCreateBoardInline] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const fetchBoards = useCallback(async () => {
    if (!accountId || !isVisible) {
      setBoards([]);
      setBoardsLoading(false);
      return;
    }
    setBoardsLoading(true);
    setBoardsError(null);
    try {
      const res = await fetchApi(`/api/pinterest/boards?accountId=${encodeURIComponent(accountId)}`,
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
  }, [accountId, isVisible]);

  useEffect(() => {
    if (isVisible) fetchBoards();
  }, [isVisible, fetchBoards]);

  useEffect(() => {
    if (!isVisible || !accountId) return;
    const savedBoard = getRememberedBoard(accountId);
    const savedLink = getRememberedLink(accountId);
    if (savedBoard && !value.boardId) {
      onChange({ ...value, boardId: savedBoard });
    }
    if (savedLink != null && savedLink !== "" && !value.link) {
      onChange({ ...value, link: savedLink });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when visible for this account
  }, [isVisible, accountId]);

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

  const handleCreateBoard = async (
    e: React.FormEvent | React.MouseEvent | React.KeyboardEvent,
  ) => {
    e.preventDefault();
    (e as React.SyntheticEvent).stopPropagation();
    if (!createName.trim()) return;
    setCreateSubmitting(true);
    setBoardsError(null);
    try {
      const res = await fetchApi("/api/pinterest/boards", {
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
      await fetchBoards();
      if (data.board?.id) {
        handleBoardChange(data.board.id);
        if (value.rememberBoard) setRememberedBoard(accountId, data.board.id);
      }
      setCreateBoardInline(false);
      setCreateName("");
    } catch (err) {
      setBoardsError(
        err instanceof Error ? err.message : "Failed to create board",
      );
    } finally {
      setCreateSubmitting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="space-y-6 pt-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="block text-sm font-medium text-text">
            Board <span className="text-destructive">*</span>
          </label>
          <span className="rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium">
            required
          </span>
        </div>
        <div className="relative">
          <select
            value={value.boardId}
            onChange={(e) => handleBoardChange(e.target.value)}
            disabled={boardsLoading}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
          >
            <option value="">
              {boardsLoading ? "Loading boards…" : "Select a board"}
            </option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {boardsLoading && (
            <div
              className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-lg overflow-hidden bg-bg-muted"
              aria-hidden
            >
              <div
                className="h-full w-1/3 max-w-[120px] rounded-full bg-accent"
                style={{
                  animation: "loadingBar 1.4s ease-in-out infinite",
                }}
              />
            </div>
          )}
        </div>
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
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreateBoard(e);
                  }
                }}
                placeholder="Board name"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text w-full min-w-[180px] flex-1"
              />
              <button
                type="button"
                disabled={createSubmitting || !createName.trim()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateBoard(e);
                }}
                className="rounded-lg bg-accent text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {createSubmitting ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateBoardInline(false);
                  setCreateName("");
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text"
              >
                Cancel
              </button>
            </div>
          )}
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
          <span className="text-sm text-text">
            Remember board for this account
          </span>
        </label>
      </div>

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
            onChange({
              ...value,
              title: e.target.value.slice(0, PINTEREST_TITLE_MAX),
            })
          }
          maxLength={PINTEREST_TITLE_MAX}
          placeholder="Enter your pin title"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <p className="mt-1 text-xs text-text-muted">
          Title for your Pinterest pin (max {PINTEREST_TITLE_MAX} characters).
          If not provided, uses first {PINTEREST_TITLE_MAX} characters of
          caption.
        </p>
      </div>

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
          <span className="text-sm text-text">
            Remember link for this account
          </span>
        </label>
      </div>
    </div>
  );
}

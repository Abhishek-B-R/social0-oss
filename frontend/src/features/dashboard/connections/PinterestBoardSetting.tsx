import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InlineError, Skeleton } from "@/components/app";
import { setRememberedBoard } from "@/lib/pinterest-remembered";
import {
  ACCOUNT_METADATA_QUERY_KEY,
  createPinterestBoard,
  savePinterestDefaultBoard,
  usePinterestBoards,
  type PinterestBoard,
} from "./use-account-details";

const fieldCls =
  "h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm text-text focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-60 touch:h-11";

/**
 * Default board for one Pinterest account. Saves on change (no Save button):
 * the composer pre-selects it for new pins.
 */
export function PinterestBoardSetting({
  accountId,
  defaultBoardId,
  canManage,
}: {
  accountId: string;
  /** From platformMetadata.pinterestDefaultBoardId; undefined while loading. */
  defaultBoardId: string | null | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const boards = usePinterestBoards(accountId);
  // Local override while a save is in flight / after it lands.
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrivacy, setNewPrivacy] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const current = picked ?? defaultBoardId ?? "";

  const writeMetadataCache = (boardId: string) => {
    queryClient.setQueryData<Record<string, Record<string, unknown>>>(
      ACCOUNT_METADATA_QUERY_KEY,
      (prev) =>
        prev
          ? {
              ...prev,
              [accountId]: { ...(prev[accountId] ?? {}), pinterestDefaultBoardId: boardId },
            }
          : prev,
    );
  };

  const save = async (boardId: string) => {
    if (!boardId || boardId === current) return;
    const previous = current;
    setPicked(boardId);
    setSaving(true);
    setSaved(false);
    try {
      await savePinterestDefaultBoard(accountId, boardId);
      setRememberedBoard(accountId, boardId);
      writeMetadataCache(boardId);
      setSaved(true);
    } catch (err) {
      setPicked(previous || null);
      toast.error(err instanceof Error ? err.message : "Couldn't save the default board.");
    } finally {
      setSaving(false);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreatePending(true);
    setCreateError(null);
    try {
      const board = await createPinterestBoard({ accountId, name, privacy: newPrivacy });
      queryClient.setQueryData<PinterestBoard[]>(
        ["connections", "pinterest-boards", accountId],
        (prev) => [...(prev ?? []), board],
      );
      setCreating(false);
      setNewName("");
      await save(board.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create the board.");
    } finally {
      setCreatePending(false);
    }
  };

  const list = boards.data ?? [];
  const currentName = list.find((b) => b.id === current)?.name;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`pin-board-${accountId}`} className="text-sm font-medium text-text">
          Default board
        </label>
        <span aria-live="polite" className="text-xs text-text-muted">
          {saving ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
              Saving
            </span>
          ) : saved ? (
            <span className="inline-flex items-center gap-1 text-ok">
              <Check className="size-3" aria-hidden />
              Saved
            </span>
          ) : null}
        </span>
      </div>
      <p className="text-xs text-text-muted">
        New pins start on this board. You can still pick another one per post.
      </p>

      {boards.isLoading || defaultBoardId === undefined ? (
        <Skeleton className="h-10 w-full rounded-xl" />
      ) : boards.isError ? (
        <InlineError
          message={
            boards.error instanceof Error
              ? boards.error.message
              : "Couldn't load your Pinterest boards."
          }
          onRetry={() => void boards.refetch()}
        />
      ) : !canManage ? (
        <p className="text-sm text-text">
          {currentName ?? (current ? "A board that no longer exists" : "None set")}
        </p>
      ) : (
        <select
          id={`pin-board-${accountId}`}
          className={fieldCls}
          value={list.some((b) => b.id === current) ? current : ""}
          onChange={(e) => void save(e.target.value)}
          disabled={saving}
        >
          <option value="" disabled>
            {list.length === 0 ? "No boards yet. Create one below." : "Choose a board"}
          </option>
          {list.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {canManage && !boards.isError ? (
        creating ? (
          <form onSubmit={create} className="space-y-2 rounded-xl border border-border p-3">
            <label htmlFor={`pin-new-board-${accountId}`} className="text-sm font-medium text-text">
              New board name
            </label>
            <input
              id={`pin-new-board-${accountId}`}
              className={fieldCls}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={50}
              autoFocus
              required
            />
            <fieldset className="flex items-center gap-4 text-sm text-text">
              <legend className="sr-only">Board visibility</legend>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`pin-privacy-${accountId}`}
                  checked={newPrivacy === "PUBLIC"}
                  onChange={() => setNewPrivacy("PUBLIC")}
                />
                Public
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`pin-privacy-${accountId}`}
                  checked={newPrivacy === "PRIVATE"}
                  onChange={() => setNewPrivacy("PRIVATE")}
                />
                Secret
              </label>
            </fieldset>
            {createError ? <InlineError message={createError} /> : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreating(false);
                  setCreateError(null);
                }}
                disabled={createPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createPending || !newName.trim()}>
                {createPending ? (
                  <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
                ) : null}
                Create and use
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)} className="-ml-2">
            <Plus aria-hidden />
            New board
          </Button>
        )
      ) : null}
    </div>
  );
}

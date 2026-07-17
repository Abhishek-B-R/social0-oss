import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import {
  IconBriefcase,
  IconHome,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  createWorkspaceInTeam,
  deleteWorkspace,
  listWorkspaceBoard,
  moveAccountToWorkspace,
  renameWorkspace,
  switchWorkspace,
  type WorkspaceBoardAccount,
  type WorkspaceBoardCard,
} from "@/api/team";
import { AccountAvatar } from "@/components/AccountAvatar";
import DocsInfoIcon from "@/components/info-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlatformIcon } from "@/lib/platform-icons";
import { cn } from "@/lib/utils";
import { DOCS_TEAMS_URL } from "@/lib/docs-url";

const BOARD_QUERY_KEY = ["workspace-board"] as const;
const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

function connectionHandle(platform: string, username: string | null): string {
  const name = username?.trim();
  if (!name) return platform === "tiktok" ? "TikTok account" : "@user";
  if (platform === "tiktok" && /\s/.test(name)) return name;
  return `@${name}`;
}

export function WorkspacesPage() {
  const queryClient = useQueryClient();
  const [movingId, setMovingId] = useState<string | null>(null);
  const [addTeamId, setAddTeamId] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | "main" | null>(null);

  const boardQuery = useQuery({
    queryKey: BOARD_QUERY_KEY,
    queryFn: listWorkspaceBoard,
  });

  const cards = boardQuery.data?.cards ?? [];
  const canCreateTeam = !!boardQuery.data?.canCreateTeam;

  const ownedTeamOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of cards) {
      if (card.kind === "owned" && card.teamId && card.teamName) {
        map.set(card.teamId, card.teamName);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [cards]);

  const moveTargets = useMemo(
    () =>
      cards.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        teamName: c.teamName,
      })),
    [cards],
  );

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["team"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
    ]);
  };

  const handleMove = async (
    accountId: string,
    targetWorkspaceId: string | null,
  ) => {
    setMovingId(accountId);
    try {
      await moveAccountToWorkspace(accountId, targetWorkspaceId);
      toast.success("Connection moved");
      await invalidateAll();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to move connection",
      );
    } finally {
      setMovingId(null);
    }
  };

  const handleSwitch = async (workspaceId: string | null, label: string) => {
    const key = workspaceId ?? "main";
    const active = cards.find((c) => c.isActive);
    if (
      (workspaceId === null && active?.id === null) ||
      workspaceId === active?.id
    ) {
      return;
    }
    setSwitchingId(key);
    try {
      await switchWorkspace(workspaceId);
      await invalidateAll();
      toast.success(`Switched to ${label}`);
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to switch workspace",
      );
      setSwitchingId(null);
    }
  };

  const handleAddWorkspace = async () => {
    if (!addTeamId || !addName.trim()) return;
    setAdding(true);
    try {
      await createWorkspaceInTeam(addTeamId, addName.trim());
      toast.success("Workspace created");
      setAddTeamId(null);
      setAddName("");
      await invalidateAll();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create workspace",
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameDraft.trim()) return;
    setRenaming(true);
    try {
      await renameWorkspace(renameTarget.id, renameDraft.trim());
      toast.success("Workspace renamed");
      setRenameTarget(null);
      await invalidateAll();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to rename workspace",
      );
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const wasActive = cards.some(
        (c) => c.id === deleteTarget.id && c.isActive,
      );
      await deleteWorkspace(deleteTarget.id);
      toast.success("Workspace deleted");
      setDeleteTarget(null);
      await invalidateAll();
      if (wasActive) window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete workspace",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (boardQuery.isLoading) {
    return <BoardSkeleton />;
  }

  if (boardQuery.isError) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {boardQuery.error instanceof Error
          ? boardQuery.error.message
          : "Could not load workspaces."}
        <div className="mt-4">
          <Button variant="outline" onClick={() => void boardQuery.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="mb-2 flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight text-foreground landing sm:text-3xl">
              Workspaces
            </h1>
            <DocsInfoIcon url={DOCS_TEAMS_URL} />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Organize connections across workspaces. Use Move to transfer an
            account without reconnecting.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={boardQuery.isFetching}
            onClick={() => void boardQuery.refetch()}
          >
            <IconRefresh
              className={`h-4 w-4 ${boardQuery.isFetching ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            Refresh
          </Button>
          {ownedTeamOptions.length > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setAddTeamId(ownedTeamOptions[0]!.id);
                setAddName("");
              }}
            >
              <IconPlus className="h-4 w-4" strokeWidth={1.5} />
              Add workspace
            </Button>
          ) : canCreateTeam ? (
            <Link
              href="/dashboard/teams/create"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <IconPlus className="h-4 w-4" strokeWidth={1.5} />
              Create team
            </Link>
          ) : null}
          <Link
            href="/dashboard/teams"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <IconUsers className="h-4 w-4" strokeWidth={1.5} />
            Teams
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <WorkspaceBoardCardView
            key={card.id ?? "main"}
            card={card}
            moveTargets={moveTargets}
            movingId={movingId}
            switching={
              switchingId === (card.id ?? "main")
            }
            onMove={(accountId, targetId) =>
              void handleMove(accountId, targetId)
            }
            onSwitch={() => void handleSwitch(card.id, card.name)}
            onRename={
              card.canRename && card.id
                ? () => {
                    setRenameTarget({ id: card.id!, name: card.name });
                    setRenameDraft(card.name);
                  }
                : undefined
            }
            onDelete={
              card.canDelete && card.id
                ? () =>
                    setDeleteTarget({ id: card.id!, name: card.name })
                : undefined
            }
            onAddToTeam={
              card.kind === "owned" && card.teamId
                ? () => {
                    setAddTeamId(card.teamId);
                    setAddName("");
                  }
                : undefined
            }
          />
        ))}
      </div>

      {cards.length <= 1 && ownedTeamOptions.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-bg-elevated px-6 py-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-muted text-text-muted">
            <IconBriefcase className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-text">
            Only Main for now
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
            Create a team to add more workspaces and move connections between
            them.
          </p>
          {canCreateTeam ? (
            <Link
              href="/dashboard/teams/create"
              className={cn(buttonVariants(), "mt-6")}
            >
              <IconPlus className="h-4 w-4" strokeWidth={1.5} />
              Create a team
            </Link>
          ) : (
            <Link
              href="/dashboard/billing"
              className={cn(buttonVariants(), "mt-6")}
            >
              Upgrade to Pro
            </Link>
          )}
        </div>
      ) : null}

      <Dialog
        open={!!addTeamId}
        onOpenChange={(open) => {
          if (!open) {
            setAddTeamId(null);
            setAddName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add workspace</DialogTitle>
            <DialogDescription>
              New workspaces start empty. Move connections here anytime.
            </DialogDescription>
          </DialogHeader>
          {ownedTeamOptions.length > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="add-ws-team">Team</Label>
              <select
                id="add-ws-team"
                value={addTeamId ?? ""}
                onChange={(e) => setAddTeamId(e.target.value)}
                disabled={adding}
                className="w-full rounded-md border border-input bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {ownedTeamOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="new-workspace-name">Name</Label>
            <Input
              id="new-workspace-name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="e.g. Brand accounts"
              maxLength={80}
              disabled={adding}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddWorkspace();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={adding}
              onClick={() => setAddTeamId(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={adding || !addName.trim()}
              onClick={() => void handleAddWorkspace()}
            >
              {adding ? (
                <IconLoader2
                  className="h-4 w-4 animate-spin"
                  strokeWidth={1.5}
                />
              ) : (
                <IconPlus className="h-4 w-4" strokeWidth={1.5} />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>
              Connections stay in place — only the label changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-workspace-name">Name</Label>
            <Input
              id="rename-workspace-name"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              maxLength={80}
              disabled={renaming}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={renaming}
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={renaming || !renameDraft.trim()}
              onClick={() => void handleRename()}
            >
              {renaming ? (
                <IconLoader2
                  className="h-4 w-4 animate-spin"
                  strokeWidth={1.5}
                />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workspace?</DialogTitle>
            <DialogDescription>
              This permanently deletes &ldquo;{deleteTarget?.name}&rdquo;.
              Connections in it will return to Main. A team needs at least one
              workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? (
                <IconLoader2
                  className="h-4 w-4 animate-spin"
                  strokeWidth={1.5}
                />
              ) : (
                <IconTrash className="h-4 w-4" strokeWidth={1.5} />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WorkspaceBoardCardView({
  card,
  moveTargets,
  movingId,
  switching,
  onMove,
  onSwitch,
  onRename,
  onDelete,
  onAddToTeam,
}: {
  card: WorkspaceBoardCard;
  moveTargets: {
    id: string | null;
    name: string;
    kind: WorkspaceBoardCard["kind"];
    teamName: string | null;
  }[];
  movingId: string | null;
  switching: boolean;
  onMove: (accountId: string, targetWorkspaceId: string | null) => void;
  onSwitch: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onAddToTeam?: () => void;
}) {
  const isPersonal = card.kind === "personal";
  const isTeam = !isPersonal;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-bg-elevated shadow-sm",
        isPersonal
          ? "border-emerald-500/70"
          : "border-sky-500/60",
        card.isActive && "ring-2 ring-accent/40",
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            isPersonal ? "bg-emerald-500/15 text-emerald-600" : "bg-sky-500/15 text-sky-600",
          )}
        >
          {isPersonal ? (
            <IconHome className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <IconBriefcase className="h-4 w-4" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={switching || card.isActive}
              onClick={onSwitch}
              className="truncate text-left text-sm font-semibold capitalize text-text hover:underline disabled:no-underline"
              title={card.isActive ? "Active workspace" : "Switch to this workspace"}
            >
              {card.name}
            </button>
            {onRename ? (
              <button
                type="button"
                onClick={onRename}
                className="rounded p-0.5 text-text-muted hover:bg-bg-muted hover:text-text"
                aria-label={`Rename ${card.name}`}
              >
                <IconPencil className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {isPersonal ? (
              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                Default
              </span>
            ) : (
              <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
                Team
              </span>
            )}
            {card.teamName ? (
              <span className="truncate text-xs text-text-muted">
                {card.teamName}
              </span>
            ) : null}
            {card.isActive ? (
              <span className="text-[11px] font-medium text-accent">Active</span>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-text-muted">
          {card.connectionCount}
        </span>
      </div>

      <div className="flex min-h-[120px] flex-1 flex-col">
        {card.accounts.length === 0 ? (
          <p className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-text-muted">
            No accounts yet
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {card.accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                currentWorkspaceId={card.id}
                moveTargets={moveTargets}
                canMove={card.canManage}
                moving={movingId === account.id}
                onMove={onMove}
              />
            ))}
          </ul>
        )}
      </div>

      {isTeam ? (
        <div className="mt-auto space-y-2 border-t border-border px-4 py-3">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="text-sm font-medium text-destructive hover:underline"
            >
              Delete Team Workspace
            </button>
          ) : null}
          {!card.isOwner ? (
            <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-800 dark:text-sky-300">
              Team workspace — only the team owner can rename or delete.
            </p>
          ) : onAddToTeam ? (
            <button
              type="button"
              onClick={onAddToTeam}
              className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400"
            >
              + Add another workspace to this team
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AccountRow({
  account,
  currentWorkspaceId,
  moveTargets,
  canMove,
  moving,
  onMove,
}: {
  account: WorkspaceBoardAccount;
  currentWorkspaceId: string | null;
  moveTargets: {
    id: string | null;
    name: string;
    kind: WorkspaceBoardCard["kind"];
    teamName: string | null;
  }[];
  canMove: boolean;
  moving: boolean;
  onMove: (accountId: string, targetWorkspaceId: string | null) => void;
}) {
  const PlatformIcon = getPlatformIcon(account.platform);
  const destinations = moveTargets.filter(
    (t) => t.id !== currentWorkspaceId,
  );

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="relative shrink-0">
        <AccountAvatar
          profileImageUrl={account.profileImageUrl}
          username={account.platformUsername}
          platform={account.platform}
          size="sm"
        />
        {PlatformIcon ? (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-bg-elevated ring-1 ring-border">
            <PlatformIcon className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm text-text">
        {connectionHandle(account.platform, account.platformUsername)}
      </span>
      {canMove && destinations.length > 0 ? (
        <MoveMenu
          disabled={moving}
          busy={moving}
          destinations={destinations}
          onSelect={(id) => onMove(account.id, id)}
        />
      ) : null}
    </li>
  );
}

function MoveMenu({
  destinations,
  disabled,
  busy,
  onSelect,
}: {
  destinations: {
    id: string | null;
    name: string;
    kind: WorkspaceBoardCard["kind"];
    teamName: string | null;
  }[];
  disabled: boolean;
  busy: boolean;
  onSelect: (workspaceId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-border bg-bg px-2.5 py-1 text-xs font-medium text-text hover:bg-bg-muted disabled:opacity-60"
      >
        {busy ? (
          <IconLoader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
        ) : (
          "Move"
        )}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border bg-bg-elevated py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Move to
          </p>
          {destinations.map((dest) => (
            <button
              key={dest.id ?? "main"}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(dest.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg-muted"
            >
              {dest.kind === "personal" ? (
                <IconHome
                  className="h-4 w-4 shrink-0 text-text-muted"
                  strokeWidth={1.5}
                />
              ) : (
                <IconBriefcase
                  className="h-4 w-4 shrink-0 text-text-muted"
                  strokeWidth={1.5}
                />
              )}
              <span className="min-w-0 truncate capitalize">{dest.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-md bg-bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-bg-muted/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-56 rounded-xl border border-border bg-bg-elevated"
          />
        ))}
      </div>
    </div>
  );
}

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import {
  IconBriefcase,
  IconHome,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
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
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";
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
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefillTeamId, setCreatePrefillTeamId] = useState<string | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    teamName: string | null;
    /** Sole workspace / solo container → connections go to Main. */
    movesToMain: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | "main" | null>(null);

  const boardQuery = useQuery({
    queryKey: BOARD_QUERY_KEY,
    queryFn: listWorkspaceBoard,
  });

  const cards = boardQuery.data?.cards ?? [];
  const canCreate = !!boardQuery.data?.canCreate;
  const canCreateTeam = !!boardQuery.data?.canCreateTeam;
  const ownedTeamCount = boardQuery.data?.ownedTeamCount ?? 0;
  const maxOwnedTeams = boardQuery.data?.maxOwnedTeams ?? 5;

  const ownedTeamOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of cards) {
      if (card.kind === "owned" && card.teamId && card.teamName) {
        map.set(card.teamId, card.teamName);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [cards]);

  const canOpenCreate = canCreate || canCreateTeam || ownedTeamOptions.length > 0;

  const openCreate = (prefillTeamId?: string | null) => {
    setCreatePrefillTeamId(prefillTeamId ?? null);
    setCreateOpen(true);
  };

  const moveTargets = useMemo(
    () =>
      cards.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        teamName: c.teamName,
        ownerUserId: c.ownerUserId,
        canManage: c.canManage,
      })),
    [cards],
  );

  const actorUserId = useMemo(
    () => cards.find((c) => c.kind === "personal")?.ownerUserId ?? null,
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
    if (switchingId) return;
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
      toast.success(
        "Workspace deleted. Connections were moved to the team's default workspace (duplicates skipped).",
      );
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
    return <DashboardPageSkeleton message="Loading workspaces..." />;
  }

  if (boardQuery.isError) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-bg-elevated p-6 text-sm text-text">
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
          {canOpenCreate ? (
            <Button type="button" size="sm" onClick={() => openCreate()}>
              <IconPlus className="h-4 w-4" strokeWidth={1.5} />
              Add workspace
            </Button>
          ) : (
            <Link
              href="/dashboard/billing"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Upgrade to Pro
            </Link>
          )}
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
            actorUserId={actorUserId}
            moveTargets={moveTargets}
            movingId={movingId}
            switching={switchingId === (card.id ?? "main")}
            switchLocked={!!switchingId}
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
                ? () => {
                    const teamWsCount = card.teamId
                      ? cards.filter((c) => c.teamId === card.teamId).length
                      : 0;
                    setDeleteTarget({
                      id: card.id!,
                      name: card.name,
                      teamName: card.teamName,
                      movesToMain: !card.teamName || teamWsCount <= 1,
                    });
                  }
                : undefined
            }
          />
        ))}
      </div>

      {cards.length <= 1 && ownedTeamOptions.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">
          Create a team to add more workspaces and move connections between
          them.
          {canOpenCreate ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => openCreate()}
                className="font-medium text-accent transition-opacity duration-150 ease-out hover:opacity-80"
              >
                Create a workspace
              </button>
            </>
          ) : (
            <>
              {" "}
              <Link
                href="/dashboard/billing"
                className="font-medium text-accent transition-opacity duration-150 ease-out hover:opacity-80"
              >
                Upgrade to Pro
              </Link>
            </>
          )}
        </p>
      ) : null}

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreatePrefillTeamId(null);
        }}
        ownedTeams={ownedTeamOptions}
        canCreate={canCreate}
        canCreateTeam={canCreateTeam}
        ownedTeamCount={ownedTeamCount}
        maxOwnedTeams={maxOwnedTeams}
        prefillTeamId={createPrefillTeamId}
        onCreated={async () => {
          setCreateOpen(false);
          setCreatePrefillTeamId(null);
          await invalidateAll();
        }}
      />

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (renaming) return;
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>
              Only the label changes — connections stay put.
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
          if (deleting) return;
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workspace?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.movesToMain
                ? `Deletes “${deleteTarget?.name}”. Connections move to Main; duplicates already there are skipped.`
                : `Deletes “${deleteTarget?.name}”. Connections move to ${
                    deleteTarget?.teamName
                      ? `${deleteTarget.teamName}'s default workspace`
                      : "the team's default workspace"
                  }; duplicates already there are skipped.`}
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
  actorUserId,
  moveTargets,
  movingId,
  switching,
  switchLocked,
  onMove,
  onSwitch,
  onRename,
  onDelete,
}: {
  card: WorkspaceBoardCard;
  actorUserId: string | null;
  moveTargets: {
    id: string | null;
    name: string;
    kind: WorkspaceBoardCard["kind"];
    teamName: string | null;
    ownerUserId: string;
    canManage: boolean;
  }[];
  movingId: string | null;
  switching: boolean;
  switchLocked: boolean;
  onMove: (accountId: string, targetWorkspaceId: string | null) => void;
  onSwitch: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const isPersonal = card.kind === "personal";
  const isTeam = !!card.teamName;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border border-border bg-bg-elevated",
        card.isActive && "ring-2 ring-accent/30",
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        {isPersonal ? (
          <IconHome
            className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
            strokeWidth={1.5}
          />
        ) : (
          <IconBriefcase
            className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
            strokeWidth={1.5}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={switchLocked || card.isActive}
              onClick={onSwitch}
              className="truncate text-left text-sm font-medium capitalize text-text transition-opacity duration-150 ease-out hover:opacity-70 disabled:opacity-100"
              title={
                card.isActive
                  ? "Active workspace"
                  : "Switch to this workspace"
              }
            >
              {card.name}
            </button>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {isPersonal
              ? "Default"
              : isTeam
                ? `Team · ${card.teamName}`
                : null}
            {card.isActive ? (
              <>
                {(isPersonal || isTeam) && " · "}
                <span className="text-accent">Active</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onRename ? (
            <button
              type="button"
              onClick={onRename}
              className="rounded-lg p-1.5 text-text-muted transition-colors duration-150 ease-out hover:bg-muted hover:text-text active:scale-[0.97]"
              aria-label={`Rename ${card.name}`}
              title="Rename"
            >
              <IconPencil className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg p-1.5 text-text-muted transition-colors duration-150 ease-out hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
              aria-label={`Delete ${card.name}`}
              title="Delete"
            >
              <IconTrash className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : null}
          <span
            className="ml-1 tabular-nums text-xs text-text-muted"
            title={`${card.connectionCount} connection${card.connectionCount === 1 ? "" : "s"}`}
          >
            {card.connectionCount}
          </span>
        </div>
      </div>

      <div className="flex min-h-[100px] flex-1 flex-col">
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
                accountOwnerUserId={card.ownerUserId}
                actorUserId={actorUserId}
                moveTargets={moveTargets}
                canMove={card.canManage}
                moving={movingId === account.id}
                onMove={onMove}
              />
            ))}
          </ul>
        )}
      </div>

      {isTeam && !card.isOwner ? (
        <div className="mt-auto border-t border-border px-4 py-3">
          <p className="text-xs text-text-muted">
            {card.canManage
              ? "Admins can connect and move accounts. Only the owner can rename or delete."
              : "Only the team owner can rename or delete."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AccountRow({
  account,
  currentWorkspaceId,
  accountOwnerUserId,
  actorUserId,
  moveTargets,
  canMove,
  moving,
  onMove,
}: {
  account: WorkspaceBoardAccount;
  currentWorkspaceId: string | null;
  accountOwnerUserId: string;
  actorUserId: string | null;
  moveTargets: {
    id: string | null;
    name: string;
    kind: WorkspaceBoardCard["kind"];
    teamName: string | null;
    ownerUserId: string;
    canManage: boolean;
  }[];
  canMove: boolean;
  moving: boolean;
  onMove: (accountId: string, targetWorkspaceId: string | null) => void;
}) {
  const PlatformIcon = getPlatformIcon(account.platform);
  const destinations = moveTargets.filter((t) => {
    if (t.id === currentWorkspaceId || !t.canManage) return false;
    // Same owner pool (Main ↔ owned workspaces, or within one team's workspaces).
    if (t.ownerUserId === accountOwnerUserId) return true;
    if (!actorUserId) return false;
    // Into a team you admin (from your personal/owned connections).
    if (accountOwnerUserId === actorUserId && t.ownerUserId !== actorUserId) {
      return true;
    }
    // Out of a team you admin, back to your Main / owned workspaces.
    if (accountOwnerUserId !== actorUserId && t.ownerUserId === actorUserId) {
      return true;
    }
    return false;
  });

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
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        const menu = document.getElementById("workspace-move-menu");
        if (menu?.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl border border-border bg-bg-elevated px-2.5 py-1 text-xs font-medium text-text transition-colors duration-150 ease-out hover:bg-muted active:scale-[0.97] disabled:opacity-60"
      >
        {busy ? (
          <IconLoader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
        ) : (
          "Move"
        )}
      </button>
      {open && menuPos
        ? createPortal(
            <div
              id="workspace-move-menu"
              style={{ top: menuPos.top, right: menuPos.right }}
              className="fixed z-50 max-h-64 min-w-[200px] overflow-y-auto rounded-xl border border-border bg-bg-elevated py-1 shadow-lg"
            >
              <p className="px-3 py-1.5 text-xs text-text-muted">Move to</p>
              {destinations.map((dest) => (
                <button
                  key={dest.id ?? "main"}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelect(dest.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition-colors duration-150 ease-out hover:bg-muted"
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
                  <span className="min-w-0 flex-1 truncate capitalize">
                    {dest.name}
                    {dest.teamName ? (
                      <span className="text-text-muted"> · {dest.teamName}</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

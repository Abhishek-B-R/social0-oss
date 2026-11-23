import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PencilSimple,
  Plus,
  Trash,
} from "@/icons/phosphor";
import { ErrorState, RowActions, SkeletonRows } from "@/components/app";
import { toast } from "sonner";
import {
  deleteWorkspace,
  listWorkspaceBoard,
  moveAccountToWorkspace,
  renameWorkspace,
  switchWorkspace,
  type WorkspaceBoardAccount,
  type WorkspaceBoardCard,
  type WorkspaceBoardResponse,
} from "@/api/team";
import { WorkspaceIcon } from "@/lib/workspace-icons";
import { AccountAvatar } from "@/components/AccountAvatar";
import { Button } from "@/components/ui/button";
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
import { SettingsHeaderActions } from "@/features/dashboard/settings/SettingsHeaderActions";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { useLimitModal } from "@/components/billing/use-limit-modal";
import {
  DASHBOARD_HOME_SEGMENT,
  writePersonalWorkspaceId,
  writeTeamWorkspaceId,
} from "@/lib/dashboard-base-path";
import { clearTeamBootstrap } from "@/layouts/team-bootstrap";
import { forgetAppPath } from "@/features/dashboard/settings/settings-workspace";
import { getTeamIdFromPathname } from "@/lib/dashboard-base-path";
import {
  invalidateTeamRoomQueries,
  WORKSPACE_BOARD_QUERY_KEY,
} from "@/lib/team-query-keys";

function connectionHandle(platform: string, username: string | null): string {
  const name = username?.trim();
  if (!name) return platform === "tiktok" ? "TikTok account" : "@user";
  if (platform === "tiktok" && /\s/.test(name)) return name;
  return `@${name}`;
}

/**
 * Every workspace you can open, one section each with its accounts. Move an account
 * between workspaces without reconnecting, switch, rename, delete, create.
 * Lives in Settings → Workspaces (old /dashboard/workspaces redirects).
 */
export function WorkspacesBoard() {
  const queryClient = useQueryClient();
  const [movingId, setMovingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { openLimit, limitModal } = useLimitModal();
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
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | "main" | null>(null);

  const boardQuery = useQuery({
    queryKey: WORKSPACE_BOARD_QUERY_KEY,
    queryFn: listWorkspaceBoard,
  });

  const cards = useMemo(
    () => boardQuery.data?.cards ?? [],
    [boardQuery.data?.cards],
  );
  const canCreate = !!boardQuery.data?.canCreate;
  const canCreateTeam = !!boardQuery.data?.canCreateTeam;
  const ownedTeamCount = boardQuery.data?.ownedTeamCount ?? 0;
  const maxOwnedTeams = boardQuery.data?.maxOwnedTeams ?? 5;

  const ownedTeamOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of cards) {
      if (card.kind !== "owned" || !card.teamId) continue;
      // Solo containers have null teamName — still list them as add targets.
      map.set(card.teamId, card.teamName ?? card.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [cards]);

  const openCreate = (prefillTeamId?: string | null) => {
    // Nothing they can create on this plan: show the plan-limit moment instead.
    if (!canCreate && !canCreateTeam && ownedTeamOptions.length === 0) {
      openLimit("workspaces");
      return;
    }
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
        icon: c.icon,
      })),
    [cards],
  );

  const actorUserId = useMemo(
    () => cards.find((c) => c.kind === "personal")?.ownerUserId ?? null,
    [cards],
  );

  const invalidateAll = async () => {
    await invalidateTeamRoomQueries(queryClient);
  };

  const applyMoveOptimistically = (
    accountId: string,
    targetWorkspaceId: string | null,
  ) => {
    queryClient.setQueryData<WorkspaceBoardResponse>(
      WORKSPACE_BOARD_QUERY_KEY,
      (prev) => {
        if (!prev) return prev;
        let moved: WorkspaceBoardAccount | null = null;
        const withoutSource = prev.cards.map((card) => {
          const nextAccounts = card.accounts.filter((a) => {
            if (a.id !== accountId) return true;
            moved = a;
            return false;
          });
          if (nextAccounts.length === card.accounts.length) return card;
          return {
            ...card,
            accounts: nextAccounts,
            connectionCount: Math.max(0, card.connectionCount - 1),
          };
        });
        if (!moved) return prev;
        return {
          ...prev,
          cards: withoutSource.map((card) => {
            const isTarget =
              targetWorkspaceId === null
                ? card.id === null
                : card.id === targetWorkspaceId;
            if (!isTarget) return card;
            if (card.accounts.some((a) => a.id === accountId)) return card;
            return {
              ...card,
              accounts: [...card.accounts, moved!],
              connectionCount: card.connectionCount + 1,
            };
          }),
        };
      },
    );
  };

  const handleMove = async (
    accountId: string,
    targetWorkspaceId: string | null,
  ) => {
    if (movingId) return;
    setMovingId(accountId);
    try {
      await moveAccountToWorkspace(accountId, targetWorkspaceId);
      applyMoveOptimistically(accountId, targetWorkspaceId);
      setMovingId(null);
      toast.success("Account moved");
      void invalidateAll();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't move the account. Try again.",
      );
      setMovingId(null);
      // Reconcile in case the move partially applied or cache drifted.
      void invalidateAll();
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
    const target = cards.find((c) =>
      workspaceId === null ? c.id === null : c.id === workspaceId,
    );
    setSwitchingId(key);
    try {
      await switchWorkspace(workspaceId);
      clearTeamBootstrap();
      if (workspaceId === null || !target || target.kind === "personal") {
        writePersonalWorkspaceId(null);
        await invalidateAll();
        toast.success(`Switched to ${label}`);
        window.location.assign(`/dashboard/${DASHBOARD_HOME_SEGMENT}`);
        return;
      }
      if (target.teamId) {
        writeTeamWorkspaceId(target.teamId, workspaceId);
        await invalidateAll();
        toast.success(`Switched to ${label}`);
        window.location.assign(
          `/dashboard/teams/${target.teamId}/${DASHBOARD_HOME_SEGMENT}`,
        );
        return;
      }
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
      const result = await renameWorkspace(
        renameTarget.id,
        renameDraft.trim(),
      );
      queryClient.setQueryData<WorkspaceBoardResponse>(
        WORKSPACE_BOARD_QUERY_KEY,
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            cards: prev.cards.map((c) =>
              c.id === renameTarget.id ? { ...c, name: result.name } : c,
            ),
          };
        },
      );
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
        deleteTarget.movesToMain
          ? `Deleted “${deleteTarget.name}”. Its accounts moved to Main (duplicates skipped).`
          : `Deleted “${deleteTarget.name}”. Its accounts moved to the team's default workspace (duplicates skipped).`,
      );
      setDeleteTarget(null);
      setDeleteConfirmText("");
      await invalidateAll();
      if (wasActive) {
        // Deleting a solo workspace also deletes its container team; reloading
        // a /teams/<id>/... URL would land on "Team not found".
        if (getTeamIdFromPathname(window.location.pathname)) {
          clearTeamBootstrap();
          forgetAppPath();
          window.location.assign("/dashboard/settings/workspaces");
        } else {
          window.location.reload();
        }
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete workspace",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (boardQuery.isLoading) {
    return <SkeletonRows rows={4} thumbnail={false} className="rounded-none border-x-0 bg-transparent" />;
  }

  if (boardQuery.isError) {
    return (
      <ErrorState
        message="Couldn't load your workspaces."
        detail={boardQuery.error instanceof Error ? boardQuery.error.message : undefined}
        onRetry={() => void boardQuery.refetch()}
        retrying={boardQuery.isFetching}
      />
    );
  }

  return (
    <>
      <SettingsHeaderActions fallbackClassName="mb-4 flex justify-end">
        <Button type="button" size="sm" onClick={() => openCreate()}>
          <Plus className="h-4 w-4" />
          New workspace
        </Button>
      </SettingsHeaderActions>

      {/* One borderless section per workspace (heading + hairline account rows). */}
      <div className="space-y-10">
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
                    setDeleteConfirmText("");
                  }
                : undefined
            }
          />
        ))}
      </div>

      {!canCreate && !canCreateTeam ? (
        <p className="mt-4 text-sm text-text-muted">
          Creating workspaces needs a paid plan.{" "}
          <button
            type="button"
            onClick={() => openLimit("workspaces")}
            className="font-medium text-accent transition-opacity duration-150 ease-out hover:opacity-80"
          >
            See plans
          </button>
        </p>
      ) : null}

      {limitModal}
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
              Only the name changes. Accounts and posts stay where they are.
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
              {renaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (deleting) return;
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete workspace?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.movesToMain
                ? `Accounts in “${deleteTarget?.name}” move to Main. Ones already there are skipped.`
                : `Accounts in “${deleteTarget?.name}” move to ${
                    deleteTarget?.teamName
                      ? `${deleteTarget.teamName}'s default workspace`
                      : "the team's default workspace"
                  }. Ones already there are skipped.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete-board-workspace">
              Type{" "}
              <span className="font-medium text-text">
                {deleteTarget?.name}
              </span>{" "}
              to confirm
            </Label>
            <Input
              id="confirm-delete-board-workspace"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoFocus
              disabled={deleting}
              autoComplete="off"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  deleteTarget &&
                  deleteConfirmText === deleteTarget.name
                ) {
                  e.preventDefault();
                  void handleDelete();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                deleting ||
                !deleteTarget ||
                deleteConfirmText !== deleteTarget.name
              }
              onClick={() => void handleDelete()}
            >
              {deleting ? "Deleting…" : "Delete workspace"}
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
    icon: string;
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
    <section aria-label={card.name} className="relative flex flex-col">
      {/* `group/row` on the header only, so hovering an account row doesn't
          also reveal every other row's Move. */}
      <div className="group/row flex items-start gap-3 border-b border-border pb-3">
        <WorkspaceIcon
          id={card.icon ?? (isPersonal ? "house" : "briefcase")}
          className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-left text-[15px] font-semibold capitalize text-text">
              {card.name}
            </h2>
          </div>
          <p className="mt-0.5 text-[13px] text-text-muted">
            {switching
              ? "Opening…"
              : isPersonal
                ? "Default"
                : isTeam
                  ? `Team · ${card.teamName}`
                  : null}
            {!switching && card.isActive ? (
              <>
                {(isPersonal || isTeam) && " · "}
                <span className="text-accent">Active</span>
              </>
            ) : null}
          </p>
        </div>
        {onRename || onDelete ? (
          <RowActions className="shrink-0 gap-0.5">
            {onRename ? (
              <button
                type="button"
                onClick={onRename}
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-text-muted transition-colors duration-150 ease-out touch-manipulation hover:bg-muted hover:text-text active:scale-[0.97] touch:h-10 touch:w-10"
                aria-label={`Rename ${card.name}`}
                title="Rename"
              >
                <PencilSimple className="h-4 w-4" />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-text-muted transition-colors duration-150 ease-out touch-manipulation hover:bg-destructive/10 hover:text-destructive active:scale-[0.97] touch:h-10 touch:w-10"
                aria-label={`Delete ${card.name}`}
                title="Delete"
              >
                <Trash className="h-4 w-4" />
              </button>
            ) : null}
          </RowActions>
        ) : null}
        {!card.isActive ? (
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0 text-text-muted hover:text-text"
            disabled={switchLocked}
            onClick={onSwitch}
            title="Switch to this workspace"
          >
            {switching ? "Switching…" : "Switch"}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col">
        {card.accounts.length === 0 ? (
          <p className="py-3 text-[13px] text-text-muted">No accounts yet.</p>
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
        <div className="mt-auto border-t border-border py-3">
          <p className="text-xs text-text-muted">
            {card.canManage
              ? "Admins can connect and move accounts. Only the owner can rename or delete."
              : "Only the team owner can rename or delete."}
          </p>
        </div>
      ) : null}
    </section>
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
    icon: string;
  }[];
  canMove: boolean;
  moving: boolean;
  onMove: (accountId: string, targetWorkspaceId: string | null) => void;
}) {
  const platformIcon = getPlatformIcon(account.platform);
  const destinations = moveTargets.filter((t) => {
    if (t.id === currentWorkspaceId || !t.canManage) return false;
    // Same owner pool (Main ↔ owned workspaces, or within one team's workspaces).
    if (t.ownerUserId === accountOwnerUserId) return true;
    if (!actorUserId) return false;
    // Into a team you admin (from your personal/owned connections).
    // Someone else's connection never leaves its owner's pool: the server
    // refuses moving it into your Main or a workspace you own.
    return accountOwnerUserId === actorUserId && t.ownerUserId !== actorUserId;
  });

  return (
    <li className="group/row flex items-center gap-3 py-2.5">
      <div className="relative shrink-0">
        <AccountAvatar
          profileImageUrl={account.profileImageUrl}
          username={account.platformUsername}
          platform={account.platform}
          size="sm"
        />
        {platformIcon ? (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-bg-elevated ring-1 ring-border">
            {createElement(platformIcon, { className: "h-2.5 w-2.5" })}
          </span>
        ) : null}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm text-text">
        {connectionHandle(account.platform, account.platformUsername)}
      </span>
      {canMove && destinations.length > 0 ? (
        <RowActions visible={moving} className="has-[[aria-expanded=true]]:opacity-100">
          <MoveMenu
            disabled={moving}
            busy={moving}
            destinations={destinations}
            onSelect={(id) => onMove(account.id, id)}
          />
        </RowActions>
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
    icon: string;
  }[];
  disabled: boolean;
  busy: boolean;
  onSelect: (workspaceId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const gap = 4;
      const edgePad = 8;
      const preferredMax = 256;
      const spaceBelow = window.innerHeight - rect.bottom - gap - edgePad;
      const spaceAbove = rect.top - gap - edgePad;
      const openDown =
        spaceBelow >= 140 || spaceBelow >= spaceAbove;
      const right = Math.max(
        edgePad,
        window.innerWidth - rect.right,
      );

      if (openDown) {
        setMenuPos({
          top: rect.bottom + gap,
          right,
          maxHeight: Math.min(preferredMax, Math.max(96, spaceBelow)),
        });
      } else {
        setMenuPos({
          bottom: window.innerHeight - rect.top + gap,
          right,
          maxHeight: Math.min(preferredMax, Math.max(96, spaceAbove)),
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, destinations.length]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-busy={busy || undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Send to another workspace without reconnecting"
        className="inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors duration-150 ease-out touch-manipulation hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 touch:min-h-10 touch:px-3"
      >
        {busy ? "Moving…" : "Move"}
      </button>
      {open && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                top: menuPos.top,
                bottom: menuPos.bottom,
                right: menuPos.right,
                maxHeight: menuPos.maxHeight,
              }}
              className="fixed z-50 min-w-[200px] overflow-y-auto rounded-xl border border-border bg-bg-elevated py-1 shadow-lg"
            >
              <p className="px-3 py-1.5 text-xs text-text-muted">Move to</p>
              {destinations.map((dest) => (
                <button
                  key={dest.id ?? "main"}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onSelect(dest.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition-colors duration-150 ease-out hover:bg-muted"
                >
                  <WorkspaceIcon
                    id={
                      dest.icon ??
                      (dest.kind === "personal" ? "house" : "briefcase")
                    }
                    className="h-4 w-4 shrink-0 text-text-muted"
                  />
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

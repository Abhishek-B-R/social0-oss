import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createWorkspaceInTeam,
  deleteTeam,
  deleteWorkspace,
  leaveTeam,
  renameTeam,
  renameWorkspace,
  type TeamGetResponse,
  type TeamListItem,
} from "@/api/team";
import { RowActions } from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { WorkspaceIcon } from "@/lib/workspace-icons";
import { clearTeamBootstrap } from "@/layouts/team-bootstrap";
import { invalidateTeamRoomQueries, teamQueryKey } from "@/lib/team-query-keys";
import { cn } from "@/lib/utils";
import { useAutosave } from "@/features/dashboard/settings/use-autosave";
import { forgetAppPath } from "@/features/dashboard/settings/settings-workspace";
import {
  FieldError,
  SettingsCard,
  SettingsRow,
  settingsInputClass,
} from "@/features/dashboard/settings/settings-ui";

const NAME_MAX = 80;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** After leaving or deleting a team: drop its cached gate and land on Main. */
function leaveToPersonalHome() {
  clearTeamBootstrap();
  forgetAppPath();
  window.location.assign("/dashboard/home");
}

/** Team name (owner edits, autosaves) + the team's workspaces. */
export function TeamGeneralCards({
  team,
  teamItem,
}: {
  team: TeamGetResponse;
  /** From the workspaces list; carries each workspace's icon. */
  teamItem?: TeamListItem | null;
}) {
  const queryClient = useQueryClient();
  const t = team.team!;
  const isOwner = team.isOwner;

  const name = useAutosave<string>({
    value: t.name,
    delay: 800,
    errorMessage: "Couldn't rename the team",
    validate: (v) => (v.trim() ? null : "The team needs a name."),
    save: async (v) => {
      await renameTeam(t.id, v.trim());
    },
    onSaved: (v) => {
      queryClient.setQueryData<TeamGetResponse>(teamQueryKey(t.id), (prev) =>
        prev?.team ? { ...prev, team: { ...prev.team, name: v.trim() } } : prev,
      );
      void invalidateTeamRoomQueries(queryClient, t.id);
    },
  });

  return (
    <>
      <SettingsCard title="Team">
        <SettingsRow
          label="Team name"
          htmlFor="settings-team-name"
          description={isOwner ? "Shown in the workspace switcher and in invites." : "Only the owner can rename the team."}
        >
          {isOwner ? (
            <>
              <input
                id="settings-team-name"
                value={name.value}
                maxLength={NAME_MAX}
                aria-invalid={name.error ? true : undefined}
                aria-describedby={name.error ? "settings-team-name-error" : undefined}
                onChange={(e) => name.set(e.target.value)}
                onBlur={name.flush}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    name.flush();
                  }
                }}
                className={cn(settingsInputClass, "sm:w-72")}
              />
              <FieldError id="settings-team-name-error">{name.error}</FieldError>
            </>
          ) : (
            <p className="text-sm font-medium text-text sm:text-right">{t.name}</p>
          )}
        </SettingsRow>
      </SettingsCard>
      <TeamWorkspacesCard team={team} teamItem={teamItem ?? null} />
    </>
  );
}

function TeamWorkspacesCard({
  team,
  teamItem,
}: {
  team: TeamGetResponse;
  teamItem: TeamListItem | null;
}) {
  const queryClient = useQueryClient();
  const t = team.team!;
  const isOwner = team.isOwner;
  const defaultId = t.defaultWorkspaceId ?? team.workspaces[0]?.id ?? null;
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const refresh = () => invalidateTeamRoomQueries(queryClient, t.id);

  const add = async () => {
    const n = newName.trim();
    if (!n || adding) return;
    setAdding(true);
    try {
      await createWorkspaceInTeam(t.id, n);
      toast.success(`Added “${n}”`);
      setNewName("");
      await refresh();
    } catch (err) {
      toast.error("Couldn't add the workspace", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setAdding(false);
    }
  };

  const commitRename = async (id: string, previous: string) => {
    const n = draft.trim();
    setEditingId(null);
    if (!n || n === previous) return;
    setSavingId(id);
    try {
      await renameWorkspace(id, n);
      toast.success("Workspace renamed");
      await refresh();
    } catch (err) {
      toast.error("Couldn't rename the workspace", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <SettingsCard
      title="Workspaces in this team"
      description={
        isOwner
          ? "Everyone in the team can open every workspace. Deleting one moves its accounts to the default workspace."
          : "Everyone in the team can open every workspace."
      }
    >
      <ul className="-mx-1 divide-y divide-border">
        {team.workspaces.map((ws) => {
          const isDefault = ws.id === defaultId;
          const canDelete = isOwner && !isDefault && team.workspaces.length > 1;
          return (
            <li key={ws.id} className="group/row flex min-h-12 items-center gap-3 px-1 py-2">
              <WorkspaceIcon
                id={teamItem?.workspaces.find((w) => w.id === ws.id)?.icon ?? "briefcase"}
                className="size-4 shrink-0 text-text-muted"
              />
              <div className="min-w-0 flex-1">
                {editingId === ws.id ? (
                  <input
                    autoFocus
                    aria-label={`New name for ${ws.name}`}
                    value={draft}
                    maxLength={NAME_MAX}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void commitRename(ws.id, ws.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename(ws.id, ws.name);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    className={cn(settingsInputClass, "h-8")}
                  />
                ) : (
                  <p className="truncate text-sm font-medium text-text">{ws.name}</p>
                )}
                <p className="text-xs text-text-muted">
                  {plural(ws.connectionCount, "account")}
                  {isDefault ? ", default" : ""}
                  {ws.isActive ? (
                    <>
                      {" · "}
                      <span className="text-accent">Open now</span>
                    </>
                  ) : null}
                </p>
              </div>
              {savingId === ws.id ? (
                <Loader2 className="size-4 animate-spin text-text-muted motion-reduce:animate-none" aria-label="Saving" />
              ) : null}
              {(isOwner && editingId !== ws.id) || canDelete ? (
                <RowActions className="gap-0.5">
                  {isOwner && editingId !== ws.id ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Rename ${ws.name}`}
                      title="Rename"
                      onClick={() => {
                        setDraft(ws.name);
                        setEditingId(ws.id);
                      }}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${ws.name}`}
                      title="Delete"
                      className="text-text-muted hover:bg-danger-soft hover:text-danger"
                      onClick={() => setDeleteTarget({ id: ws.id, name: ws.name })}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </RowActions>
              ) : null}
            </li>
          );
        })}
      </ul>
      {isOwner ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label htmlFor="settings-new-team-workspace" className="sr-only">
            New workspace name
          </label>
          <input
            id="settings-new-team-workspace"
            placeholder="New workspace name, e.g. Client: Bloom Café"
            value={newName}
            maxLength={NAME_MAX}
            disabled={adding}
            onChange={(e) => setNewName(e.target.value)}
            className={cn(settingsInputClass, "sm:flex-1")}
          />
          <Button type="submit" variant="outline" className="h-9 touch:h-11" disabled={adding || !newName.trim()}>
            {adding ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Plus aria-hidden />}
            {adding ? "Adding…" : "Add workspace"}
          </Button>
        </form>
      ) : null}

      <TypedConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete “${deleteTarget?.name ?? ""}”?`}
        description="Its accounts move to the team's default workspace. Accounts already there are skipped. Posts stay in history."
        confirmText={deleteTarget?.name ?? ""}
        actionLabel="Delete workspace"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const result = await deleteWorkspace(deleteTarget.id);
          const parts = [`Deleted “${deleteTarget.name}”`];
          if (result.moved > 0) parts.push(`${plural(result.moved, "account")} moved to the default workspace`);
          if (result.skipped > 0) parts.push(`${plural(result.skipped, "duplicate")} skipped`);
          toast.success(parts.join(". "));
          setDeleteTarget(null);
          await refresh();
        }}
      />
    </SettingsCard>
  );
}

/** A solo workspace (its own container, no members): rename + delete. */
export function SoloWorkspaceCards({ teamItem }: { teamItem: TeamListItem }) {
  const queryClient = useQueryClient();
  const ws = teamItem.workspaces[0];
  const [deleteOpen, setDeleteOpen] = useState(false);
  const name = useAutosave<string>({
    value: ws?.name ?? teamItem.name,
    delay: 800,
    errorMessage: "Couldn't rename the workspace",
    validate: (v) => (v.trim() ? null : "The workspace needs a name."),
    save: async (v) => {
      if (!ws) throw new Error("This workspace no longer exists.");
      await renameWorkspace(ws.id, v.trim());
    },
    onSaved: () => void invalidateTeamRoomQueries(queryClient, teamItem.id),
  });

  return (
    <>
      <SettingsCard title="Workspace" description="A workspace of your own, separate from Main. Only you can open it.">
        <SettingsRow label="Name" htmlFor="settings-solo-name">
          <input
            id="settings-solo-name"
            value={name.value}
            maxLength={NAME_MAX}
            disabled={!teamItem.isOwner}
            aria-invalid={name.error ? true : undefined}
            onChange={(e) => name.set(e.target.value)}
            onBlur={name.flush}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                name.flush();
              }
            }}
            className={cn(settingsInputClass, "sm:w-72")}
          />
          <FieldError>{name.error}</FieldError>
        </SettingsRow>
      </SettingsCard>
      {teamItem.isOwner && ws ? (
        <SettingsCard tone="danger" title="Danger zone">
          <SettingsRow
            label="Delete this workspace"
            description="Its accounts move to Main. Accounts already in Main are skipped."
          >
            <Button
              variant="outline"
              size="sm"
              className="border-danger-border text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => setDeleteOpen(true)}
            >
              Delete workspace…
            </Button>
          </SettingsRow>
          <TypedConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete “${ws.name}”?`}
            description="Its accounts move to Main. Accounts already in Main are skipped. You'll land on Main afterwards."
            confirmText={ws.name}
            actionLabel="Delete workspace"
            onConfirm={async () => {
              await deleteWorkspace(ws.id);
              toast.success(`Deleted “${ws.name}”`);
              await invalidateTeamRoomQueries(queryClient, teamItem.id);
              leaveToPersonalHome();
            }}
          />
        </SettingsCard>
      ) : null}
    </>
  );
}

/** Owner: delete the team (keep or discard its accounts). Others: leave. */
export function TeamDangerZone({ team }: { team: TeamGetResponse }) {
  const queryClient = useQueryClient();
  const t = team.team!;
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mode, setMode] = useState<"keep" | "discard" | null>(null);

  if (!team.isOwner) {
    return (
      <SettingsCard tone="danger" title="Danger zone">
        <SettingsRow
          label="Leave team"
          description={`You'll lose access to every workspace in ${t.name}. An admin can invite you again.`}
        >
          <Button
            variant="outline"
            size="sm"
            className="border-danger-border text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => setLeaveOpen(true)}
          >
            Leave team…
          </Button>
        </SettingsRow>
        <Dialog open={leaveOpen} onOpenChange={(o) => !leaving && setLeaveOpen(o)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Leave {t.name}?</DialogTitle>
              <DialogDescription>
                You'll lose access to its workspaces, posts and inbox. Your own Main workspace isn't affected.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={leaving}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={leaving}
                onClick={async () => {
                  setLeaving(true);
                  try {
                    await leaveTeam(t.id);
                    toast.success(`You left ${t.name}`);
                    await invalidateTeamRoomQueries(queryClient, t.id);
                    leaveToPersonalHome();
                  } catch (err) {
                    toast.error("Couldn't leave the team", {
                      description: err instanceof Error ? err.message : "Try again.",
                    });
                    setLeaving(false);
                  }
                }}
              >
                {leaving ? "Leaving…" : "Leave team"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard tone="danger" title="Danger zone">
      <SettingsRow
        label="Delete team"
        description="Removes every workspace, member and invite in this team. You choose what happens to its accounts."
      >
        <Button
          variant="outline"
          size="sm"
          className="border-danger-border text-danger hover:bg-danger-soft hover:text-danger"
          onClick={() => {
            setMode(null);
            setDeleteOpen(true);
          }}
        >
          Delete team…
        </Button>
      </SettingsRow>

      <Dialog
        open={deleteOpen && mode === null}
        onOpenChange={(o) => {
          if (!o) setDeleteOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {t.name}?</DialogTitle>
            <DialogDescription>
              Every workspace in it goes too. What should happen to its connected accounts?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setMode("keep")}
              className="rounded-xl border border-border bg-bg p-3 text-left transition-colors hover:border-accent/50 hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span className="block text-sm font-medium text-text">Keep them in Main</span>
              <span className="mt-0.5 block text-sm text-text-muted">
                Accounts move to your Main workspace. Ones already there are skipped.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("discard")}
              className="rounded-xl border border-danger-border bg-bg p-3 text-left transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              <span className="block text-sm font-medium text-danger">Disconnect them too</span>
              <span className="mt-0.5 block text-sm text-text-muted">
                The team's accounts are deleted with it.
              </span>
            </button>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TypedConfirmDialog
        open={deleteOpen && mode !== null}
        onOpenChange={(o) => {
          if (!o) setMode(null);
        }}
        title={`Delete ${t.name}`}
        description={
          mode === "keep"
            ? "Its accounts move to Main. Ones already there are skipped. Members lose access right away."
            : "Its accounts are disconnected and deleted with the team. Members lose access right away."
        }
        confirmText={t.name}
        actionLabel={mode === "keep" ? "Delete team, keep accounts" : "Delete team and accounts"}
        cancelLabel="Back"
        onConfirm={async () => {
          const keepConnections = mode === "keep";
          const result = await deleteTeam(t.id, { keepConnections });
          const parts = [`Deleted ${t.name}`];
          if (keepConnections && result.moved > 0) parts.push(`${plural(result.moved, "account")} moved to Main`);
          if (keepConnections && result.skipped > 0) parts.push(`${plural(result.skipped, "duplicate")} skipped`);
          toast.success(parts.join(". "));
          await invalidateTeamRoomQueries(queryClient, t.id);
          leaveToPersonalHome();
        }}
      />
    </SettingsCard>
  );
}

/** "Type <name> to confirm" dialog. `onConfirm` throws to show an error. */
function TypedConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  actionLabel,
  cancelLabel = "Cancel",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  actionLabel: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed === confirmText && !!confirmText;

  const run = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setTyped("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    setTyped("");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="typed-confirm-input">
            Type <span className="font-semibold text-text">{confirmText}</span> to confirm
          </Label>
          <input
            id="typed-confirm-input"
            value={typed}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
            className={settingsInputClass}
          />
          <FieldError>{error}</FieldError>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" disabled={!matches || busy} onClick={() => void run()}>
            {busy ? "Deleting…" : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

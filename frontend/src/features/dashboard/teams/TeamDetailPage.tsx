import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import {
  ArrowLeft,
  CalendarBlank,
  CaretDown,
  CaretRight,
  PencilSimple,
  Plus,
  Trash,
} from "@/icons/phosphor";
import { toast } from "sonner";
import {
  createWorkspaceInTeam,
  deleteTeam,
  deleteWorkspace,
  getTeamById,
  getTeamInvitations,
  inviteTeamMember,
  leaveTeam,
  removeTeamMember,
  renameTeam,
  revokeTeamInvitation,
  updateTeamMemberRole,
  type TeamGetResponse,
  type TeamInvitation,
  type TeamMember,
  type WorkspaceRole,
} from "@/api/team";
import { Button } from "@/components/ui/button";
import { TeamDetailPageSkeleton } from "@/components/ui/page-skeletons";
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
import {
  invalidateTeamRoomQueries,
  teamInvitationsQueryKey,
  teamQueryKey,
} from "@/lib/team-query-keys";

export function TeamDetailPage() {
  const { teamId: teamIdParam } = useParams<{ teamId: string }>();
  const teamId = teamIdParam;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("member");
  const [inviting, setInviting] = useState(false);

  const [newWsName, setNewWsName] = useState("");
  const [addingWs, setAddingWs] = useState(false);
  const [wsBusyId, setWsBusyId] = useState<string | null>(null);

  const [leaving, setLeaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"choose" | "confirm">("choose");
  const [pendingDeleteMode, setPendingDeleteMode] = useState<
    "keep" | "discard" | null
  >(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingMode, setDeletingMode] = useState<"keep" | "discard" | null>(
    null,
  );
  const [deleteWsTarget, setDeleteWsTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteWsConfirm, setDeleteWsConfirm] = useState("");

  useEffect(() => {
    if (!teamId) {
      navigate("/dashboard/teams", { replace: true });
    }
  }, [teamId, navigate]);

  const teamQuery = useQuery({
    queryKey: teamQueryKey(teamId!),
    queryFn: () => getTeamById(teamId!),
    enabled: !!teamId,
  });

  const invitationsQuery = useQuery({
    queryKey: teamInvitationsQueryKey(teamId!),
    queryFn: () => getTeamInvitations(teamId),
    enabled: !!teamId && !!teamQuery.data?.permissions.canInvite,
  });

  const refresh = () => {
    if (!teamId) return;
    void invalidateTeamRoomQueries(queryClient, teamId);
  };

  const handleSaveName = async () => {
    if (!teamId) return;
    const name = nameDraft.trim();
    if (!name) {
      toast.error("Enter a team name");
      return;
    }
    setSavingName(true);
    try {
      const result = await renameTeam(teamId, name);
      queryClient.setQueryData<TeamGetResponse>(teamQueryKey(teamId), (prev) =>
        prev?.team
          ? { ...prev, team: { ...prev.team, name: result.name } }
          : prev,
      );
      toast.success("Team name updated");
      setEditingName(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename team");
    } finally {
      setSavingName(false);
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      toast.error("Enter an email address");
      return;
    }
    setInviting(true);
    try {
      await inviteTeamMember({ email, role: inviteRole, teamId });
      toast.success("Invitation sent");
      setInviteEmail("");
      setInviteRole("member");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const handleAddWorkspace = async () => {
    if (!teamId) return;
    const name = newWsName.trim();
    if (!name) {
      toast.error("Enter a workspace name");
      return;
    }
    setAddingWs(true);
    try {
      await createWorkspaceInTeam(teamId, name);
      toast.success("Workspace created");
      setNewWsName("");
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create workspace",
      );
    } finally {
      setAddingWs(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!deleteWsTarget) return;
    setWsBusyId(deleteWsTarget.id);
    try {
      const result = await deleteWorkspace(deleteWsTarget.id);
      const parts = ["Workspace deleted"];
      if (result.moved > 0) {
        parts.push(
          `${result.moved} connection${result.moved === 1 ? "" : "s"} moved to the default workspace`,
        );
      }
      if (result.skipped > 0) {
        parts.push(
          `${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped`,
        );
      }
      toast.success(parts.join(". "));
      setDeleteWsTarget(null);
      setDeleteWsConfirm("");
      refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete workspace",
      );
    } finally {
      setWsBusyId(null);
    }
  };

  const handleLeave = async () => {
    if (!teamId || teamQuery.data?.isOwner) return;
    setLeaving(true);
    try {
      await leaveTeam(teamId);
      toast.success("Left team");
      await invalidateTeamRoomQueries(queryClient, teamId);
      navigate("/dashboard/teams", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave team");
    } finally {
      setLeaving(false);
    }
  };

  const resetDeleteTeam = () => {
    setDeleteOpen(false);
    setDeleteStep("choose");
    setPendingDeleteMode(null);
    setDeleteConfirmText("");
    setDeletingMode(null);
  };

  const handleDelete = async () => {
    if (!teamId || deletingMode || !pendingDeleteMode) return;
    const keepConnections = pendingDeleteMode === "keep";
    setDeletingMode(pendingDeleteMode);
    try {
      const result = await deleteTeam(teamId, { keepConnections });
      if (keepConnections) {
        const parts = ["Team deleted"];
        if (result.moved > 0) {
          parts.push(
            `${result.moved} connection${result.moved === 1 ? "" : "s"} moved to Main`,
          );
        }
        if (result.skipped > 0) {
          parts.push(
            `${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped`,
          );
        }
        toast.success(parts.join(". "));
      } else {
        toast.success("Team deleted");
      }
      await Promise.all([invalidateTeamRoomQueries(queryClient, teamId)]);
      navigate("/dashboard/teams", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete team");
      setDeletingMode(null);
    }
  };

  if (teamQuery.isLoading) {
    return <TeamDetailPageSkeleton />;
  }

  if (teamQuery.isError || !teamQuery.data?.team) {
    return (
      <div className="mt-6 space-y-4">
        <BackLink />
        <div className="rounded-xl border border-border bg-bg-elevated p-6 text-sm text-text">
          {teamQuery.error instanceof Error
            ? teamQuery.error.message
            : "Could not load team."}
        </div>
      </div>
    );
  }

  const { team, permissions, teamsEnabled, isOwner, members, workspaces } =
    teamQuery.data;
  const teamName = team.name;
  const defaultWorkspaceId = team.defaultWorkspaceId ?? workspaces[0]?.id;
  const invitations = invitationsQuery.data?.invitations ?? [];

  if (!teamsEnabled) {
    return (
      <div className="mt-6 space-y-4">
        <BackLink />
        <div className="rounded-xl border border-border bg-bg-elevated p-6 text-center">
          <h2 className="text-base font-semibold text-text">Teams is paused</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
            This team&apos;s Pro subscription has lapsed.
            {isOwner
              ? " Renew Pro to restore invites and shared access."
              : " Ask the team owner to renew Pro."}
          </p>
          {isOwner ? (
            <Link
              href="/dashboard/billing"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-[transform,colors] duration-150 ease-out hover:bg-accent-hover active:scale-[0.97]"
            >
              Renew Pro
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <BackLink />
      <h1 className="mt-4 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
        Team settings
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        Manage settings for {teamName}.
      </p>

      <div className="mt-6 space-y-5">
        <section className="rounded-xl border border-border bg-bg-elevated p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-text">Team information</h2>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="team-name">Team name</Label>
              {isOwner && !editingName ? (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(teamName);
                    setEditingName(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <PencilSimple className="h-3.5 w-3.5" />
                  Edit
                </button>
              ) : null}
            </div>
            {editingName ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="team-name"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={80}
                  disabled={savingName}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={savingName || !nameDraft.trim()}
                    onClick={() => void handleSaveName()}
                  >
                    {savingName ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingName}
                    onClick={() => setEditingName(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Input id="team-name" value={teamName} readOnly disabled />
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-elevated p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-text">Workspaces</h2>
          <p className="mt-1 text-sm text-text-muted">
            Members can access all workspaces below.
            {isOwner
              ? " Deleting a non-default workspace moves its connections to the default (duplicates skipped)."
              : ""}
          </p>
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {workspaces.map((ws) => (
              <li
                key={ws.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {ws.name}
                    {ws.id === defaultWorkspaceId ? (
                      <span className="ml-2 text-xs font-normal text-text-muted">
                        Default
                      </span>
                    ) : null}
                    {ws.isActive ? (
                      <span className="ml-2 text-xs font-normal text-accent">
                        Active
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-text-muted">
                    {ws.connectionCount} connected
                  </p>
                </div>
                {isOwner &&
                workspaces.length > 1 &&
                ws.id !== defaultWorkspaceId ? (
                  <button
                    type="button"
                    disabled={wsBusyId === ws.id}
                    onClick={() => {
                      setDeleteWsTarget({ id: ws.id, name: ws.name });
                      setDeleteWsConfirm("");
                    }}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    aria-label={
                      wsBusyId === ws.id
                        ? `Deleting ${ws.name}`
                        : `Delete ${ws.name}`
                    }
                    aria-busy={wsBusyId === ws.id || undefined}
                  >
                    <Trash
                      className={`h-4 w-4 ${wsBusyId === ws.id ? "opacity-40" : ""}`}
                    />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {isOwner ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="New workspace name"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                maxLength={80}
                disabled={addingWs}
                className="h-9 py-0 sm:min-w-0 sm:flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddWorkspace();
                  }
                }}
              />
              <Button
                className="h-9 shrink-0"
                disabled={addingWs || !newWsName.trim()}
                onClick={() => void handleAddWorkspace()}
              >
                {addingWs ? (
                  "Adding…"
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add workspace
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-bg-elevated p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-text">Team members</h2>

          {permissions.canInvite ? (
            <div className="mt-4 rounded-xl border border-border bg-bg p-4">
              <p className="mb-3 text-sm font-medium text-text">
                Invite member
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviting}
                  className="h-9 py-0 sm:min-w-0 sm:flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleInvite();
                    }
                  }}
                />
                <div className="relative shrink-0 sm:w-[7.5rem]">
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as WorkspaceRole)
                    }
                    disabled={inviting}
                    className="h-9 w-full appearance-none rounded-xl border border-input bg-bg px-3 pr-8 text-sm leading-none text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <CaretDown
                    className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                  />
                </div>
                <Button
                  className="h-9 shrink-0"
                  disabled={inviting || !inviteEmail.trim()}
                  onClick={() => void handleInvite()}
                >
                  {inviting ? "Sending…" : "Send invite"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-subtle text-text-muted">
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="w-[7.5rem] px-3 py-2.5 font-medium">Role</th>
                  <th className="w-[5.5rem] px-3 py-2.5 font-medium">Status</th>
                  <th className="w-[6.5rem] px-3 py-2.5 font-medium">Joined</th>
                  <th className="w-14 px-3 py-2.5 text-center font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <MemberTableRow
                    key={member.id}
                    member={member}
                    canChangeRole={
                      permissions.canChangeRoles && !member.isOwner
                    }
                    canRemove={permissions.canRemoveMembers && !member.isOwner}
                    onChanged={refresh}
                  />
                ))}
                {invitations.map((invitation) => (
                  <InvitationTableRow
                    key={invitation.id}
                    invitation={invitation}
                    canRevoke={permissions.canInvite}
                    onChanged={refresh}
                  />
                ))}
                {members.length === 0 && invitations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-2 py-8 text-center text-text-muted"
                    >
                      No members yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <Link
          href="/dashboard/settings#queue"
          className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated px-5 py-4 transition-colors duration-150 ease-out hover:bg-muted"
        >
          <CalendarBlank
            className="h-5 w-5 shrink-0 text-text-muted"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-text">
              Queue schedule
            </span>
            <span className="mt-0.5 block text-sm text-text-muted">
              Set recurring posting times for the team queue.
            </span>
          </span>
          <CaretRight
            className="h-5 w-5 shrink-0 text-text-muted"
          />
        </Link>

        {isOwner ? (
          <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-destructive">
              Danger zone
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Deleting this team permanently removes all workspaces,
              memberships, and invitations. You&apos;ll choose whether to keep
              its connections on Main.
            </p>
            <Button
              variant="destructive"
              className="mt-4"
              onClick={() => {
                setDeleteStep("choose");
                setPendingDeleteMode(null);
                setDeleteConfirmText("");
                setDeleteOpen(true);
              }}
            >
              <Trash className="h-4 w-4" />
              Delete team
            </Button>
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-bg-elevated p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-text">Leave team</h2>
            <p className="mt-2 text-sm text-text-muted">
              You&apos;ll lose access to every workspace in this team.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              disabled={leaving}
              onClick={() => void handleLeave()}
            >
              {leaving ? "Leaving…" : "Leave team"}
            </Button>
          </section>
        )}
      </div>

      <Dialog
        open={!!deleteWsTarget}
        onOpenChange={(open) => {
          if (wsBusyId) return;
          if (!open) {
            setDeleteWsTarget(null);
            setDeleteWsConfirm("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete workspace?</DialogTitle>
            <DialogDescription>
              Connections in “{deleteWsTarget?.name}” move to the team default
              workspace. Duplicates already there are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete-workspace">
              Type{" "}
              <span className="font-medium text-text">
                {deleteWsTarget?.name}
              </span>{" "}
              to confirm
            </Label>
            <Input
              id="confirm-delete-workspace"
              value={deleteWsConfirm}
              onChange={(e) => setDeleteWsConfirm(e.target.value)}
              autoFocus
              disabled={!!wsBusyId}
              autoComplete="off"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  deleteWsTarget &&
                  deleteWsConfirm === deleteWsTarget.name
                ) {
                  e.preventDefault();
                  void handleDeleteWorkspace();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!wsBusyId}
              onClick={() => {
                setDeleteWsTarget(null);
                setDeleteWsConfirm("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !!wsBusyId ||
                !deleteWsTarget ||
                deleteWsConfirm !== deleteWsTarget.name
              }
              onClick={() => void handleDeleteWorkspace()}
            >
              {wsBusyId ? "Deleting…" : "Delete workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deletingMode) return;
          if (!open) resetDeleteTeam();
          else setDeleteOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {deleteStep === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete team?</DialogTitle>
                <DialogDescription>
                  This removes “{teamName}” and every workspace in it. Choose
                  what happens to the connections.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={resetDeleteTeam}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setPendingDeleteMode("keep");
                    setDeleteConfirmText("");
                    setDeleteStep("confirm");
                  }}
                >
                  Keep connections on Main
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    setPendingDeleteMode("discard");
                    setDeleteConfirmText("");
                    setDeleteStep("confirm");
                  }}
                >
                  Discard connections too
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirm deletion</DialogTitle>
                <DialogDescription>
                  {pendingDeleteMode === "keep"
                    ? "Connections move to Main. Duplicates already there are skipped."
                    : "Connections in this team will be deleted with it."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="confirm-delete-team">
                  Type{" "}
                  <span className="font-medium text-text">{teamName}</span> to
                  confirm
                </Label>
                <Input
                  id="confirm-delete-team"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  autoFocus
                  disabled={!!deletingMode}
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      deleteConfirmText === teamName &&
                      !deletingMode
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
                  disabled={!!deletingMode}
                  onClick={() => {
                    setDeleteStep("choose");
                    setDeleteConfirmText("");
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="destructive"
                  disabled={
                    !!deletingMode || deleteConfirmText !== teamName
                  }
                  onClick={() => void handleDelete()}
                >
                  {deletingMode ? "Deleting…" : "Delete team"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/teams"
      className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to teams
    </Link>
  );
}

function MemberTableRow({
  member,
  canChangeRole,
  canRemove,
  onChanged,
}: {
  member: TeamMember;
  canChangeRole: boolean;
  canRemove: boolean;
  onChanged: () => void;
}) {
  const [roleBusy, setRoleBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const displayName = member.name?.trim() || member.email;
  const joined = new Date(member.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const handleRole = async (role: WorkspaceRole) => {
    if (role === member.role) return;
    setRoleBusy(true);
    try {
      await updateTeamMemberRole(member.id, role);
      toast.success("Role updated");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setRoleBusy(false);
    }
  };

  const handleRemove = async () => {
    setRemoveBusy(true);
    try {
      await removeTeamMember(member.id);
      toast.success("Member removed");
      setConfirmRemove(false);
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove member",
      );
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <>
      <tr className="border-b border-border last:border-b-0">
        <td className="px-3 py-2.5 align-middle">
          <p className="truncate font-medium text-text">{member.email}</p>
          {member.name?.trim() ? (
            <p className="truncate text-xs text-text-muted">{member.name}</p>
          ) : null}
        </td>
        <td className="px-3 py-2.5 align-middle">
          {canChangeRole ? (
            <div className="relative flex h-7 max-w-[6.5rem] items-center">
              <select
                value={member.role}
                disabled={roleBusy || removeBusy}
                onChange={(e) =>
                  void handleRole(e.target.value as WorkspaceRole)
                }
                aria-label={`Change role for ${displayName}`}
                className="h-7 w-full appearance-none rounded-md border border-border bg-transparent px-2 pr-6 text-sm leading-none capitalize text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-60"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              <CaretDown
                className="pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2 text-text-muted"
              />
            </div>
          ) : (
            <span className="block h-7 text-sm leading-7 capitalize text-text-muted">
              {member.isOwner ? "Owner" : member.role}
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 align-middle text-sm text-text-muted">
          Active
        </td>
        <td className="px-3 py-2.5 align-middle text-sm text-text-muted">
          {joined}
        </td>
        <td className="px-3 py-2.5 align-middle text-center">
          {canRemove ? (
            <button
              type="button"
              disabled={removeBusy || roleBusy}
              onClick={() => setConfirmRemove(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive transition-colors duration-150 ease-out hover:bg-destructive/10 active:scale-[0.97] disabled:opacity-50"
              aria-label={`Remove ${member.email}`}
            >
              <Trash className="h-4 w-4" />
            </button>
          ) : (
            <span className="inline-flex h-7 w-7 items-center justify-center text-sm text-text-muted">
              —
            </span>
          )}
        </td>
      </tr>

      <Dialog
        open={confirmRemove}
        onOpenChange={(open) => {
          if (removeBusy) return;
          setConfirmRemove(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              {displayName} will lose access to every workspace in this team.
              You can invite them again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={removeBusy}
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeBusy}
              onClick={() => void handleRemove()}
            >
              {removeBusy ? "Removing…" : "Remove member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvitationTableRow({
  invitation,
  canRevoke,
  onChanged,
}: {
  invitation: TeamInvitation;
  canRevoke: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const joined = new Date(invitation.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const handleRevoke = async () => {
    setBusy(true);
    try {
      await revokeTeamInvitation(invitation.id);
      toast.success("Invitation revoked");
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke invitation",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="max-w-0 truncate px-3 py-2.5 align-middle font-medium text-text">
        {invitation.email}
      </td>
      <td className="px-3 py-2.5 align-middle">
        <span className="block h-7 text-sm leading-7 capitalize text-text-muted">
          {invitation.role}
        </span>
      </td>
      <td className="px-3 py-2.5 align-middle text-sm text-text-muted">
        Pending
      </td>
      <td className="px-3 py-2.5 align-middle text-sm text-text-muted">
        {joined}
      </td>
      <td className="px-3 py-2.5 align-middle text-center">
        {canRevoke ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRevoke()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive transition-colors duration-150 ease-out hover:bg-destructive/10 active:scale-[0.97] disabled:opacity-50"
            aria-label={
              busy
                ? `Revoking invite for ${invitation.email}`
                : `Revoke invite for ${invitation.email}`
            }
            aria-busy={busy || undefined}
          >
            <Trash
              className={`h-4 w-4 ${busy ? "opacity-40" : ""}`}
            />
          </button>
        ) : (
          <span className="inline-flex h-7 w-7 items-center justify-center text-sm text-text-muted">
            —
          </span>
        )}
      </td>
    </tr>
  );
}

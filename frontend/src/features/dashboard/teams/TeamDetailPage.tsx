import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import {
  IconArrowLeft,
  IconCalendar,
  IconChevronRight,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
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
  switchWorkspace,
  updateTeamMemberRole,
  type TeamInvitation,
  type TeamMember,
  type WorkspaceRole,
} from "@/api/team";
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

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

export function TeamDetailPage() {
  const { teamId: teamIdParam } = useParams<{ teamId: string }>();
  const teamId = teamIdParam;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

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
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!teamId) {
      navigate("/dashboard/teams", { replace: true });
      return;
    }
    let cancelled = false;
    setReady(false);
    setSwitchError(null);

    (async () => {
      try {
        const detail = await getTeamById(teamId);
        if (!detail.team) {
          if (!cancelled) setSwitchError("Team not found.");
          return;
        }
        const activeInTeam = detail.workspaces.find((w) => w.isActive);
        const targetWs = activeInTeam ?? detail.workspaces[0];
        if (targetWs && !targetWs.isActive) {
          await switchWorkspace(targetWs.id);
        }
        if (!cancelled) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["team"] }),
            queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
            queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
            queryClient.invalidateQueries({ queryKey: ["connections"] }),
          ]);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setSwitchError(
            err instanceof Error ? err.message : "Failed to open team",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, navigate, queryClient]);

  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => getTeamById(teamId!),
    enabled: ready && !!teamId,
  });

  const invitationsQuery = useQuery({
    queryKey: ["team", teamId, "invitations"],
    queryFn: () => getTeamInvitations(teamId),
    enabled: ready && !!teamId && !!teamQuery.data?.permissions.canInvite,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
    void queryClient.invalidateQueries({
      queryKey: ["team", teamId, "invitations"],
    });
    void queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
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
      await renameTeam(teamId, name);
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
      refresh();
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create workspace",
      );
    } finally {
      setAddingWs(false);
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    setWsBusyId(workspaceId);
    try {
      await deleteWorkspace(workspaceId);
      toast.success("Workspace deleted");
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
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
      navigate("/dashboard/teams", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave team");
    } finally {
      setLeaving(false);
    }
  };

  const handleDelete = async () => {
    if (!teamId) return;
    setDeleting(true);
    try {
      await deleteTeam(teamId);
      toast.success("Team deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["team"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
        queryClient.invalidateQueries({ queryKey: ["connections"] }),
      ]);
      navigate("/dashboard/teams", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete team");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (switchError) {
    return (
      <div className="mt-6 space-y-4">
        <BackLink />
        <div className="rounded-xl border border-border bg-card p-6 text-sm">
          {switchError}
        </div>
      </div>
    );
  }

  if (!ready || teamQuery.isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-4 w-28 rounded bg-bg-muted" />
        <div className="h-8 w-40 rounded-md bg-bg-muted" />
        <div className="h-36 rounded-xl border border-border bg-bg-elevated" />
        <div className="h-52 rounded-xl border border-border bg-bg-elevated" />
      </div>
    );
  }

  if (teamQuery.isError || !teamQuery.data?.team) {
    return (
      <div className="mt-6 space-y-4">
        <BackLink />
        <div className="rounded-xl border border-border bg-card p-6 text-sm">
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
  const invitations = invitationsQuery.data?.invitations ?? [];

  if (!teamsEnabled) {
    return (
      <div className="mt-6 space-y-4">
        <BackLink />
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-6 py-10 text-center">
          <h2 className="font-serif text-xl font-semibold text-text">
            Teams is paused
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-amber-900 dark:text-amber-100">
            This team&apos;s Pro subscription has lapsed.
            {isOwner
              ? " Renew Pro to restore invites and shared access."
              : " Ask the team owner to renew Pro."}
          </p>
          {isOwner ? (
            <Link
              href="/dashboard/billing"
              className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
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
      <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight text-foreground landing sm:text-3xl">
        Team settings
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        Manage settings for {teamName}.
      </p>

      <div className="mt-6 space-y-5">
        <section className="rounded-xl border border-border bg-bg-elevated p-5 shadow-sm sm:p-6">
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
                  <IconPencil className="h-3.5 w-3.5" strokeWidth={1.5} />
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
                    {savingName ? (
                      <IconLoader2
                        className="h-4 w-4 animate-spin"
                        strokeWidth={1.5}
                      />
                    ) : null}
                    Save
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

        <section className="rounded-xl border border-border bg-bg-elevated p-5 shadow-sm sm:p-6">
          <h2 className="text-sm font-semibold text-text">Workspaces</h2>
          <p className="mt-1 text-xs text-text-muted">
            Team members can access all workspaces below.
            {isOwner ? " Only you can add or remove workspaces." : ""}
          </p>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {workspaces.map((ws) => (
              <li
                key={ws.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {ws.name}
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
                {isOwner && workspaces.length > 1 ? (
                  <button
                    type="button"
                    disabled={wsBusyId === ws.id}
                    onClick={() => void handleDeleteWorkspace(ws.id)}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    aria-label={`Delete ${ws.name}`}
                  >
                    {wsBusyId === ws.id ? (
                      <IconLoader2
                        className="h-4 w-4 animate-spin"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <IconTrash className="h-4 w-4" strokeWidth={1.5} />
                    )}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {isOwner ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="New workspace name"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                maxLength={80}
                disabled={addingWs}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddWorkspace();
                  }
                }}
              />
              <Button
                disabled={addingWs || !newWsName.trim()}
                onClick={() => void handleAddWorkspace()}
              >
                {addingWs ? (
                  <IconLoader2
                    className="h-4 w-4 animate-spin"
                    strokeWidth={1.5}
                  />
                ) : (
                  <IconPlus className="h-4 w-4" strokeWidth={1.5} />
                )}
                Add workspace
              </Button>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-bg-elevated p-5 shadow-sm sm:p-6">
          <h2 className="text-sm font-semibold text-text">Team members</h2>

          {permissions.canInvite ? (
            <div className="mt-4 rounded-lg border border-border bg-bg p-4">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-text">
                <IconUserPlus className="h-4 w-4" strokeWidth={1.5} />
                Invite new member
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviting}
                  className="sm:flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleInvite();
                    }
                  }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as WorkspaceRole)
                  }
                  disabled={inviting}
                  className="rounded-md border border-input bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <Button
                  disabled={inviting || !inviteEmail.trim()}
                  onClick={() => void handleInvite()}
                >
                  {inviting ? (
                    <IconLoader2
                      className="h-4 w-4 animate-spin"
                      strokeWidth={1.5}
                    />
                  ) : null}
                  Send invite
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-text-muted">
                  <th className="px-2 py-2 font-medium">Email</th>
                  <th className="px-2 py-2 font-medium">Role</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Joined</th>
                  <th className="px-2 py-2 font-medium">Actions</th>
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
          className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated px-5 py-4 shadow-sm transition-colors hover:bg-sidebar-active/40"
        >
          <IconCalendar
            className="h-5 w-5 shrink-0 text-text-muted"
            strokeWidth={1.5}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">
              Queue schedule
            </span>
            <span className="mt-0.5 block text-sm text-text-muted">
              Set recurring posting times so the team can add posts to a queue.
            </span>
          </span>
          <IconChevronRight
            className="h-5 w-5 shrink-0 text-text-muted"
            strokeWidth={1.5}
          />
        </Link>

        {isOwner ? (
          <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-destructive">
              Danger zone
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Deleting this team permanently removes all workspaces,
              memberships, and invitations.
            </p>
            <Button
              variant="destructive"
              className="mt-4"
              onClick={() => setDeleteOpen(true)}
            >
              <IconTrash className="h-4 w-4" strokeWidth={1.5} />
              Delete team
            </Button>
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-bg-elevated p-5 shadow-sm sm:p-6">
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
              {leaving ? (
                <IconLoader2
                  className="h-4 w-4 animate-spin"
                  strokeWidth={1.5}
                />
              ) : null}
              Leave team
            </Button>
          </section>
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete team?</DialogTitle>
            <DialogDescription>
              This permanently deletes &ldquo;{teamName}&rdquo; and all of its
              workspaces. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
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
              ) : null}
              Delete team
            </Button>
          </DialogFooter>
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
      <IconArrowLeft className="h-4 w-4" strokeWidth={1.5} />
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
    <tr className="border-b border-border last:border-b-0">
      <td className="px-2 py-3">
        <p className="font-medium text-text">{member.email}</p>
        {member.name?.trim() ? (
          <p className="text-xs text-text-muted">{member.name}</p>
        ) : null}
      </td>
      <td className="px-2 py-3">
        {canChangeRole ? (
          <div className="flex items-center gap-1.5">
            <select
              value={member.role}
              disabled={roleBusy || removeBusy}
              onChange={(e) => void handleRole(e.target.value as WorkspaceRole)}
              className="rounded-md border border-input bg-bg px-2 py-1 text-xs font-medium capitalize"
            >
              <option value="admin">admin</option>
              <option value="member">member</option>
            </select>
            {roleBusy ? (
              <IconLoader2
                className="h-3.5 w-3.5 animate-spin text-text-muted"
                strokeWidth={1.5}
              />
            ) : null}
          </div>
        ) : (
          <span className="inline-flex rounded-full bg-bg-muted px-2 py-0.5 text-xs font-medium capitalize text-text">
            {member.isOwner ? "owner" : member.role}
          </span>
        )}
      </td>
      <td className="px-2 py-3">
        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
          active
        </span>
      </td>
      <td className="px-2 py-3 text-text-muted">{joined}</td>
      <td className="px-2 py-3">
        {canRemove ? (
          <button
            type="button"
            disabled={removeBusy || roleBusy}
            onClick={() => void handleRemove()}
            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            aria-label={`Remove ${member.email}`}
          >
            {removeBusy ? (
              <IconLoader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <IconTrash className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
    </tr>
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
      <td className="px-2 py-3 font-medium text-text">{invitation.email}</td>
      <td className="px-2 py-3">
        <span className="inline-flex rounded-full bg-bg-muted px-2 py-0.5 text-xs font-medium capitalize text-text">
          {invitation.role}
        </span>
      </td>
      <td className="px-2 py-3">
        <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
          pending
        </span>
      </td>
      <td className="px-2 py-3 text-text-muted">{joined}</td>
      <td className="px-2 py-3">
        {canRevoke ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRevoke()}
            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            aria-label={`Revoke invite for ${invitation.email}`}
          >
            {busy ? (
              <IconLoader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <IconTrash className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

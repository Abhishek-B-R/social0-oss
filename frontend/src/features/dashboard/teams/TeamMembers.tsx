import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Mail, Trash2, UserPlus, X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  getTeamInvitations,
  inviteTeamMember,
  removeTeamMember,
  revokeTeamInvitation,
  updateTeamMemberRole,
  type TeamGetResponse,
  type TeamInvitation,
  type TeamMember,
  type WorkspaceRole,
} from "@/api/team";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  InlineError,
  RowActions,
  SkeletonRows,
} from "@/components/app";
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
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { workspaceRoleLabel } from "@/lib/workspace-roles";
import { invalidateTeamRoomQueries, teamInvitationsQueryKey } from "@/lib/team-query-keys";
import { SettingsHeaderActions } from "@/features/dashboard/settings/SettingsHeaderActions";
import { InviteMembersDialog } from "./InviteMembersDialog";
import { RoleMenu } from "./RoleMenu";

/**
 * Teammates per team, counting pending invites and not the owner. Mirrors
 * `MAX_TEAM_MEMBERS` in backend `lib/workspace/team-service.ts`; the server
 * enforces it, this only drives the "N of 15" line and the invite dialog.
 */
const TEAM_SEAT_LIMIT = 15;

function Avatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-7 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bg-muted text-xs font-semibold text-text-muted"
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Members table with role pickers and pending invites inline. */
export function TeamMembers({ team }: { team: TeamGetResponse }) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = team.team!;
  const { permissions } = team;
  const canInvite = permissions.canInvite && team.teamsEnabled;

  const invitationsQuery = useQuery({
    queryKey: teamInvitationsQueryKey(t.id),
    queryFn: () => getTeamInvitations(t.id),
    enabled: permissions.canInvite,
  });
  const invitations = invitationsQuery.data?.invitations ?? [];

  // `?invite=1` (palette "Invite teammate", Home checklist) opens the dialog.
  const inviteParam = searchParams.get("invite") === "1";
  const [inviteOpen, setInviteOpen] = useState(false);
  const dialogOpen = inviteOpen || (inviteParam && canInvite);
  const setDialogOpen = (open: boolean) => {
    setInviteOpen(open);
    if (!open && inviteParam) {
      const next = new URLSearchParams(searchParams);
      next.delete("invite");
      setSearchParams(next, { replace: true });
    }
  };

  const teammates = team.members.filter((m) => !m.isOwner).length;
  const used = teammates + invitations.length;
  const seatsLeft = Math.max(0, TEAM_SEAT_LIMIT - used);

  const refresh = () => invalidateTeamRoomQueries(queryClient, t.id);
  const me = session?.user?.id ?? null;

  const owners = team.members.filter((m) => m.isOwner);
  const others = team.members
    .filter((m) => !m.isOwner)
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

  return (
    <div className="space-y-3">
      {canInvite ? (
        <SettingsHeaderActions fallbackClassName="flex justify-end">
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            disabled={seatsLeft <= 0}
            title={seatsLeft <= 0 ? `All ${TEAM_SEAT_LIMIT} seats are taken` : undefined}
          >
            <UserPlus aria-hidden />
            Invite people
          </Button>
        </SettingsHeaderActions>
      ) : null}
      <p className="text-[13px] text-text-muted">
        {used} of {TEAM_SEAT_LIMIT} seats used
        {invitations.length > 0 ? `, ${invitations.length} pending` : ""}
      </p>

      {/* Hairline list, not a card: same look as every other settings section. */}
      <DataTable
        aria-label={`Members of ${t.name}`}
        className="rounded-none border-x-0 border-b-0 bg-transparent [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0"
        tableClassName="min-w-[560px]"
      >
        <DataTableHeader>
          <tr>
            <DataTableHead>Person</DataTableHead>
            <DataTableHead className="w-44">Role</DataTableHead>
            <DataTableHead className="w-36 text-right">
              <span className="sr-only">Actions</span>
            </DataTableHead>
          </tr>
        </DataTableHeader>
        <DataTableBody>
          {[...owners, ...others].map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isMe={m.userId === me}
              canChangeRole={permissions.canChangeRoles && !m.isOwner}
              canRemove={permissions.canRemoveMembers && !m.isOwner && m.userId !== me}
              onChanged={refresh}
            />
          ))}
          {invitations.map((inv) => (
            <InvitationRow
              key={inv.id}
              invitation={inv}
              teamId={t.id}
              canManage={canInvite}
              onChanged={refresh}
            />
          ))}
        </DataTableBody>
      </DataTable>

      {permissions.canInvite && invitationsQuery.isPending ? (
        <SkeletonRows rows={1} />
      ) : null}
      {invitationsQuery.isError ? (
        <InlineError
          message="Couldn't load pending invites."
          onRetry={() => void invitationsQuery.refetch()}
        />
      ) : null}
      {!permissions.canInvite ? (
        <p className="text-xs text-text-muted">
          Only admins can invite people or change roles. Ask an admin of {t.name}.
        </p>
      ) : null}

      <InviteMembersDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        teamId={t.id}
        teamName={t.name}
        seatsLeft={seatsLeft}
        onInvited={() => void refresh()}
      />
    </div>
  );
}

function MemberRow({
  member,
  isMe,
  canChangeRole,
  canRemove,
  onChanged,
}: {
  member: TeamMember;
  isMe: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
  onChanged: () => void;
}) {
  const [role, setRole] = useState<WorkspaceRole>(member.role);
  const [syncedRole, setSyncedRole] = useState(member.role);
  if (syncedRole !== member.role) {
    setSyncedRole(member.role);
    setRole(member.role);
  }
  const [roleBusy, setRoleBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const display = member.name?.trim() || member.email;

  const changeRole = async (next: WorkspaceRole) => {
    const prev = role;
    setRole(next); // optimistic
    setRoleBusy(true);
    try {
      await updateTeamMemberRole(member.id, next);
      toast.success(`${display} is now ${workspaceRoleLabel(next)}`);
      onChanged();
    } catch (err) {
      setRole(prev);
      toast.error("Couldn't change the role. It's back to " + workspaceRoleLabel(prev) + ".", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRoleBusy(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await removeTeamMember(member.id);
      toast.success(`Removed ${display}`);
      setConfirmRemove(false);
      onChanged();
    } catch (err) {
      toast.error("Couldn't remove them", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <DataTableRow>
      <DataTableCell>
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={display} image={member.image} />
          <div className="min-w-0">
            <p className="truncate font-medium text-text">
              {display}
              {isMe ? <span className="font-normal text-text-muted"> · you</span> : null}
            </p>
            {member.name?.trim() ? (
              <p className="truncate text-xs text-text-muted">{member.email}</p>
            ) : null}
          </div>
        </div>
      </DataTableCell>
      <DataTableCell>
        {canChangeRole ? (
          <RoleMenu
            value={role}
            onChange={(r) => void changeRole(r)}
            busy={roleBusy}
            disabled={roleBusy || removing}
            label={`Role for ${display}`}
          />
        ) : (
          <span className="text-sm text-text-muted">
            {member.isOwner ? "Owner" : workspaceRoleLabel(member.role)}
          </span>
        )}
      </DataTableCell>
      <DataTableCell className="text-right">
        {canRemove ? (
          <RowActions>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${display}`}
              title="Remove"
              className="text-text-muted hover:bg-danger-soft hover:text-danger"
              onClick={() => setConfirmRemove(true)}
              disabled={roleBusy || removing}
            >
              <Trash2 aria-hidden />
            </Button>
          </RowActions>
        ) : null}
        <Dialog open={confirmRemove} onOpenChange={(o) => !removing && setConfirmRemove(o)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Remove {display}?</DialogTitle>
              <DialogDescription>
                They lose access to every workspace in this team right away. Posts they made stay. You can invite
                them again later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={removing}>
                  Cancel
                </Button>
              </DialogClose>
              <Button variant="destructive" disabled={removing} onClick={() => void remove()}>
                {removing ? "Removing…" : "Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DataTableCell>
    </DataTableRow>
  );
}

function InvitationRow({
  invitation,
  teamId,
  canManage,
  onChanged,
}: {
  invitation: TeamInvitation;
  teamId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"resend" | "cancel" | null>(null);
  const expires = new Date(invitation.expiresAt);
  const expiresLabel = Number.isNaN(expires.getTime())
    ? null
    : `Expires in ${formatDistanceToNowStrict(expires)}`;

  /** There's no "resend" endpoint: cancel and send a fresh invite (new email, new expiry). */
  const resend = async () => {
    setBusy("resend");
    try {
      await revokeTeamInvitation(invitation.id);
      try {
        await inviteTeamMember({ email: invitation.email, role: invitation.role, teamId });
      } catch (err) {
        toast.error(`Couldn't resend to ${invitation.email}`, {
          description: `${err instanceof Error ? err.message : "Try again."} The old invite was cancelled, so invite them again.`,
        });
        return;
      }
      toast.success(`Invite re-sent to ${invitation.email}`);
    } catch (err) {
      toast.error(`Couldn't resend to ${invitation.email}`, {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: teamInvitationsQueryKey(teamId) });
      onChanged();
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      await revokeTeamInvitation(invitation.id);
      toast.success(`Cancelled the invite for ${invitation.email}`);
      onChanged();
    } catch (err) {
      toast.error("Couldn't cancel the invite", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    // Invites are tied to the email, not a link token: this is the same
    // sign-in link the email contains. The invite shows up after sign-in.
    const url = `${window.location.origin}${signInUrl("/dashboard/home")}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", {
        description: `Send it to ${invitation.email}. They'll see the invite after signing in with that email.`,
      });
    } catch {
      toast.error("Couldn't copy. Your browser blocked the clipboard.", { description: url });
    }
  };

  return (
    <DataTableRow>
      <DataTableCell>
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-text-muted"
          >
            <Mail className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-text">{invitation.email}</p>
            <p className="truncate text-xs text-text-muted">
              {invitation.invitedByName ? `Invited by ${invitation.invitedByName}` : "Invited"}
              {expiresLabel ? `, ${expiresLabel.charAt(0).toLowerCase()}${expiresLabel.slice(1)}` : ""}
            </p>
          </div>
        </div>
      </DataTableCell>
      <DataTableCell>
        <span className="text-sm text-text-muted">{workspaceRoleLabel(invitation.role)}</span>
      </DataTableCell>
      <DataTableCell className="text-right">
        {canManage ? (
          <RowActions className="gap-0.5">
            <Button variant="ghost" size="xs" disabled={!!busy} onClick={() => void resend()}>
              {busy === "resend" ? "Sending…" : "Resend"}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Copy sign-in link for ${invitation.email}`}
              title="Copy link"
              disabled={!!busy}
              onClick={() => void copyLink()}
            >
              <Copy aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Cancel invite for ${invitation.email}`}
              title="Cancel invite"
              className="text-text-muted hover:bg-danger-soft hover:text-danger"
              disabled={!!busy}
              onClick={() => void cancel()}
            >
              <X aria-hidden />
            </Button>
          </RowActions>
        ) : null}
      </DataTableCell>
    </DataTableRow>
  );
}

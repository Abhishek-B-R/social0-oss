import { useState } from "react";
import {
  IconLoader2,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  removeTeamMember,
  updateTeamMemberRole,
  type TeamMember,
  type TeamPermissions,
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

type MemberRowProps = {
  member: TeamMember;
  permissions: TeamPermissions;
  onChanged: () => void;
};

function RoleBadge({
  role,
  isOwner,
}: {
  role: WorkspaceRole;
  isOwner: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {isOwner && (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
          Owner
        </span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          role === "admin"
            ? "bg-accent/15 text-accent"
            : "bg-bg-muted text-text-muted"
        }`}
      >
        {role === "admin" ? "Admin" : "Member"}
      </span>
    </span>
  );
}

export function MemberRow({ member, permissions, onChanged }: MemberRowProps) {
  const [roleBusy, setRoleBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const canChangeRole =
    permissions.canChangeRoles && !member.isOwner && !roleBusy && !removeBusy;
  const canRemove =
    permissions.canRemoveMembers && !member.isOwner && !roleBusy && !removeBusy;

  const handleRoleChange = async (role: WorkspaceRole) => {
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
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemoveBusy(false);
    }
  };

  const displayName = member.name?.trim() || member.email;

  return (
    <>
      <li className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {member.image ? (
            <img
              src={member.image}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-muted text-text-muted">
              <IconUser className="h-4 w-4" strokeWidth={1.5} />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">{displayName}</p>
            {member.name?.trim() ? (
              <p className="truncate text-xs text-text-muted">{member.email}</p>
            ) : null}
            <div className="mt-1 sm:hidden">
              <RoleBadge role={member.role} isOwner={member.isOwner} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <RoleBadge role={member.role} isOwner={member.isOwner} />
          </div>

          {permissions.canChangeRoles && !member.isOwner ? (
            <div className="relative flex items-center gap-1.5">
              <select
                value={member.role}
                disabled={!canChangeRole}
                onChange={(e) =>
                  void handleRoleChange(e.target.value as WorkspaceRole)
                }
                aria-label={`Change role for ${displayName}`}
                className="rounded-lg border border-input bg-bg px-2.5 py-1.5 text-xs font-medium text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 disabled:opacity-60"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              {roleBusy ? (
                <IconLoader2
                  className="h-3.5 w-3.5 animate-spin text-text-muted"
                  strokeWidth={1.5}
                  aria-hidden
                />
              ) : null}
            </div>
          ) : null}

          {permissions.canRemoveMembers && !member.isOwner ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!canRemove}
              onClick={() => setConfirmRemove(true)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <IconTrash className="h-4 w-4" strokeWidth={1.5} />
              <span className="sr-only sm:not-sr-only">Remove</span>
            </Button>
          ) : null}
        </div>
      </li>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              {displayName} will lose access to this workspace. You can invite
              them again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmRemove(false)}
              disabled={removeBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleRemove()}
              disabled={removeBusy}
            >
              {removeBusy ? (
                <>
                  <IconLoader2
                    className="h-4 w-4 animate-spin"
                    strokeWidth={1.5}
                  />
                  Removing…
                </>
              ) : (
                "Remove member"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

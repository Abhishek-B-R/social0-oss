import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconLoader2, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import {
  acceptMyInvitation,
  declineMyInvitation,
  listMyPendingInvitations,
  type MyPendingInvitation,
} from "@/api/team";
import { Button } from "@/components/ui/button";

const MY_INVITES_QUERY_KEY = ["team", "my-invitations"] as const;

export function TeamInviteBanners() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: MY_INVITES_QUERY_KEY,
    queryFn: listMyPendingInvitations,
  });

  const invitations = useMemo(
    () => (data?.invitations ?? []).filter((inv) => !dismissed.has(inv.id)),
    [data?.invitations, dismissed],
  );

  if (invitations.length === 0) return null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: MY_INVITES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["team"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
    ]);
  };

  const handleAccept = async (inv: MyPendingInvitation) => {
    setBusyId(inv.id);
    try {
      await acceptMyInvitation(inv.id);
      toast.success(`Joined ${inv.teamName}`);
      await invalidate();
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to accept invitation",
      );
      setBusyId(null);
    }
  };

  const handleDecline = async (inv: MyPendingInvitation) => {
    setBusyId(inv.id);
    try {
      await declineMyInvitation(inv.id);
      toast.success("Invitation declined");
      await invalidate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to decline invitation",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-4 space-y-3">
      {invitations.map((inv) => {
        const busy = busyId === inv.id;
        const roleLabel = inv.role === "admin" ? "Admin" : "Member";
        const inviter = inv.inviterName?.trim() || "Someone";
        return (
          <div
            key={inv.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">
                {inviter} invited you to{" "}
                <span className="text-accent">{inv.teamName}</span> as a{" "}
                {roleLabel}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void handleAccept(inv)}
              >
                {busy ? (
                  <IconLoader2
                    className="h-4 w-4 animate-spin"
                    strokeWidth={1.5}
                  />
                ) : null}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void handleDecline(inv)}
              >
                Decline
              </Button>
              <button
                type="button"
                disabled={busy}
                aria-label="Dismiss invitation"
                onClick={() =>
                  setDismissed((prev) => new Set(prev).add(inv.id))
                }
                className="rounded-lg p-1.5 text-text-muted transition-colors duration-150 ease-out hover:bg-muted hover:text-text disabled:opacity-50"
              >
                <IconX className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

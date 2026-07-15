import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import {
  IconLoader2,
  IconSearch,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  getTeam,
  getTeamInvitations,
  revokeTeamInvitation,
  type TeamInvitation,
} from "@/api/team";
import DocsInfoIcon from "@/components/info-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOCS_TEAMS_URL } from "@/lib/docs-url";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { MemberRow } from "./MemberRow";

const TEAM_QUERY_KEY = ["team"] as const;
const INVITATIONS_QUERY_KEY = ["team", "invitations"] as const;

function UpgradeEmptyState() {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-bg-elevated px-6 py-12 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
        <IconUsers className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <h2 className="mt-4 font-serif text-xl font-semibold text-text">
        Collaborate with your team
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
        Invite teammates to a shared workspace, assign Admin or Member roles,
        and manage posts and connections together. Teams is included with Pro.
      </p>
      <Link
        href="/dashboard/billing"
        className="mt-6 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
      >
        Upgrade to Pro
      </Link>
    </div>
  );
}

function PausedEmptyState({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-6 py-10 text-center">
      <h2 className="font-serif text-xl font-semibold text-text">
        Teams is paused
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-amber-900 dark:text-amber-100">
        This workspace&apos;s Pro subscription has lapsed, so team
        collaboration is temporarily unavailable.
        {isOwner
          ? " Renew Pro to restore invites and shared access."
          : " Ask the workspace owner to renew Pro."}
      </p>
      {isOwner ? (
        <Link
          href="/dashboard/billing"
          className="mt-6 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
        >
          Renew Pro
        </Link>
      ) : null}
    </div>
  );
}

function InvitationRow({
  invitation,
  canRevoke,
  onChanged,
}: {
  invitation: TeamInvitation;
  canRevoke: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

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

  const expiresLabel = new Date(invitation.expiresAt).toLocaleDateString(
    undefined,
    { year: "numeric", month: "short", day: "numeric" },
  );

  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{invitation.email}</p>
        <p className="mt-0.5 text-xs text-text-muted">
          {invitation.role === "admin" ? "Admin" : "Member"}
          {invitation.invitedByName
            ? ` · invited by ${invitation.invitedByName}`
            : ""}
          {` · expires ${expiresLabel}`}
        </p>
      </div>
      {canRevoke ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void handleRevoke()}
        >
          {busy ? (
            <IconLoader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          ) : null}
          Revoke
        </Button>
      ) : null}
    </li>
  );
}

export function TeamsPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const teamQuery = useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: getTeam,
  });

  const invitationsEnabled =
    !!teamQuery.data?.teamsEnabled &&
    !!teamQuery.data?.workspace &&
    teamQuery.data.permissions.canInvite;

  const invitationsQuery = useQuery({
    queryKey: INVITATIONS_QUERY_KEY,
    queryFn: getTeamInvitations,
    enabled: invitationsEnabled,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
  };

  const filteredMembers = useMemo(() => {
    const members = teamQuery.data?.members ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const hay = `${m.name ?? ""} ${m.email}`.toLowerCase();
      return hay.includes(q);
    });
  }, [teamQuery.data?.members, search]);

  if (teamQuery.isLoading) {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
        <IconLoader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
        Loading teams…
      </div>
    );
  }

  if (teamQuery.isError || !teamQuery.data) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {teamQuery.error instanceof Error
          ? teamQuery.error.message
          : "Could not load teams."}
        <div className="mt-4">
          <Button variant="outline" onClick={() => void teamQuery.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const {
    workspace,
    permissions,
    teamsEnabled,
    upgradeRequired,
    isOwner,
  } = teamQuery.data;

  const showUpgradeCta =
    upgradeRequired || (!teamsEnabled && (isOwner || !workspace));

  if (showUpgradeCta) {
    return (
      <>
        <TeamsHeader workspaceName={null} />
        <UpgradeEmptyState />
      </>
    );
  }

  if (!teamsEnabled && workspace) {
    return (
      <>
        <TeamsHeader workspaceName={workspace.name} />
        <PausedEmptyState isOwner={isOwner} />
      </>
    );
  }

  const invitations = invitationsQuery.data?.invitations ?? [];

  return (
    <>
      <TeamsHeader workspaceName={workspace?.name ?? null}>
        {permissions.canInvite ? (
          <Button onClick={() => setInviteOpen(true)}>
            <IconUserPlus className="h-4 w-4" strokeWidth={1.5} />
            Invite
          </Button>
        ) : null}
      </TeamsHeader>

      <div className="mt-6 space-y-6">
        <div className="relative max-w-md">
          <IconSearch
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            strokeWidth={1.5}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members…"
            className="pl-9"
            aria-label="Search members"
          />
        </div>

        <section className="rounded-xl border border-border bg-bg-elevated shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">
              Members
              <span className="ml-2 font-normal text-text-muted">
                ({filteredMembers.length})
              </span>
            </h2>
          </div>
          {filteredMembers.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">
              {search.trim()
                ? "No members match your search."
                : "No members yet."}
            </p>
          ) : (
            <ul>
              {filteredMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  permissions={permissions}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </section>

        {(permissions.canInvite || invitations.length > 0) && (
          <section className="rounded-xl border border-border bg-bg-elevated shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text">
                Pending invitations
                <span className="ml-2 font-normal text-text-muted">
                  ({invitations.length})
                </span>
              </h2>
            </div>
            {invitationsQuery.isLoading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-text-muted">
                <IconLoader2
                  className="h-4 w-4 animate-spin"
                  strokeWidth={1.5}
                />
                Loading invitations…
              </div>
            ) : invitations.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-text-muted">
                No pending invitations.
              </p>
            ) : (
              <ul>
                {invitations.map((invitation) => (
                  <InvitationRow
                    key={invitation.id}
                    invitation={invitation}
                    canRevoke={permissions.canInvite}
                    onChanged={refresh}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={refresh}
      />
    </>
  );
}

function TeamsHeader({
  workspaceName,
  children,
}: {
  workspaceName: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="mb-2 flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight text-foreground landing sm:text-3xl">
            Teams
          </h1>
          <DocsInfoIcon url={DOCS_TEAMS_URL} />
        </div>
        <p className="mt-1 text-sm text-text-muted">
          {workspaceName
            ? `Manage members for ${workspaceName}.`
            : "Invite teammates and manage your shared workspace."}
        </p>
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

import { lazy, Suspense } from "react";
import Link from "@/components/AppLink";
import { ErrorState } from "@/components/app";
import { TeamGeneralCards, TeamDangerZone, SoloWorkspaceCards } from "@/features/dashboard/teams/TeamGeneral";
import { TeamMembers } from "@/features/dashboard/teams/TeamMembers";
import { TeamsPanel } from "@/features/dashboard/teams/TeamsPanel";
import { useSettingsScope } from "../settings-scope";
import { SettingsCard, SettingsRow, SettingsRowsSkeleton, settingsStackClass } from "../settings-ui";
import { PreferencesCard } from "./PreferencesCard";

const WorkspacesBoard = lazy(() =>
  import("@/features/dashboard/workspaces/WorkspacesBoard").then((m) => ({
    default: m.WorkspacesBoard,
  })),
);
const BillingPage = lazy(() =>
  import("@/features/dashboard/billing/BillingPage").then((m) => ({ default: m.BillingPage })),
);

/** Team scope: wait for `/api/team/:id`, show an error with Retry if it fails. */
function useTeamGate() {
  const scope = useSettingsScope();
  const q = scope.teamQuery;
  if (!q) return { kind: "personal" as const, scope };
  if (q.isPending) return { kind: "loading" as const, scope };
  if (q.isError || !q.data?.team) {
    return {
      kind: "error" as const,
      scope,
      node: (
        <ErrorState
          message="Couldn't load this team."
          detail={
            q.error instanceof Error
              ? `${q.error.message} If you were removed from it, open Main from the workspace switcher.`
              : "You may no longer be a member."
          }
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      ),
    };
  }
  return { kind: "team" as const, scope, team: q.data };
}

export function GeneralSection() {
  const gate = useTeamGate();
  const { scope } = gate;

  return (
    <div className={settingsStackClass}>
      {gate.kind === "personal" ? (
        <SettingsCard title="Workspace">
          <SettingsRow
            label="Main"
            description="Your personal workspace. It's always there and can't be renamed or deleted."
          >
            <Link
              href={`${scope.settingsBase}/workspaces`}
              className="text-sm font-medium text-accent hover:underline"
            >
              See all workspaces
            </Link>
          </SettingsRow>
        </SettingsCard>
      ) : gate.kind === "loading" ? (
        <SectionSkeleton rows={2} />
      ) : gate.kind === "error" ? (
        gate.node
      ) : scope.isSolo && scope.teamListItem ? (
        <SoloWorkspaceCards teamItem={scope.teamListItem} />
      ) : (
        <TeamGeneralCards team={gate.team} teamItem={scope.teamListItem} />
      )}

      <PreferencesCard />

      {gate.kind === "team" && !scope.isSolo ? <TeamDangerZone team={gate.team} /> : null}
    </div>
  );
}

export function MembersSection() {
  const gate = useTeamGate();
  if (gate.kind === "personal") return <TeamsPanel />;
  if (gate.kind === "loading") return <SectionSkeleton rows={4} />;
  if (gate.kind === "error") return gate.node;
  if (gate.scope.isSolo) {
    return (
      <SettingsCard
        title={`${gate.scope.workspaceName} is just you`}
        description="This is a workspace of your own, not a team. To post with other people, create a team and invite them there."
      >
        <SettingsRow label="Teams">
          <Link href="/dashboard/settings/members" className="text-sm font-medium text-accent hover:underline">
            See your teams
          </Link>
        </SettingsRow>
      </SettingsCard>
    );
  }
  return <TeamMembers team={gate.team} />;
}

export function WorkspacesSection() {
  return (
    <Suspense fallback={<SectionSkeleton rows={4} />}>
      <WorkspacesBoard />
    </Suspense>
  );
}

/**
 * Billing is the account owner's plan. In a team, the owner sees their own
 * billing (the team runs on it); everyone else is told who handles it.
 */
export function BillingSection() {
  const gate = useTeamGate();
  if (gate.kind === "loading") return <SectionSkeleton rows={3} />;
  if (gate.kind === "error") return gate.node;
  if (gate.kind === "team" && !gate.team.isOwner) {
    return (
      <SettingsCard
        description={`${gate.team.team?.name ?? "This team"}'s plan is paid by the team owner. Ask them about seats or upgrades.`}
      >
        <SettingsRow label="Your own plan" description="Main and any workspaces you own use your plan.">
          <Link href="/dashboard/settings/billing" className="text-sm font-medium text-accent hover:underline">
            Open your billing
          </Link>
        </SettingsRow>
      </SettingsCard>
    );
  }
  return (
    <Suspense fallback={<SectionSkeleton rows={3} />}>
      <BillingPage embedded />
    </Suspense>
  );
}

/** Untitled section of placeholder rows (no card). */
function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <SettingsCard>
      <SettingsRowsSkeleton rows={rows} />
    </SettingsCard>
  );
}

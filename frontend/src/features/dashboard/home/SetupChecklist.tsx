import { useQuery } from "@tanstack/react-query";
import { Check, Circle } from "lucide-react";
import type { DashboardHomeData } from "@/api/dashboard";
import { listWorkspaces } from "@/api/team";
import Link from "@/components/AppLink";
import { openComposer, useDashboardPath, useTeamId } from "@/components/app";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { cn } from "@/lib/utils";
import {
  buildSetupSteps,
  canSeeSetup,
  setupProgress,
  useSetupVisibility,
  type SetupStep,
  type SetupStepId,
} from "./setup";

const ACTION_LABEL: Record<SetupStepId, string> = {
  connect: "Connect",
  agent: "Set up",
  publish: "Write it",
  schedule: "Set times",
  invite: "Invite",
};

const BLOCKED_COPY: Record<SetupStepId, string> = {
  connect: "An admin can connect accounts",
  agent: "",
  publish: "Your role can't create posts",
  schedule: "Your role can't change the schedule",
  invite: "",
};

/**
 * Where "Invite" goes. In a team it opens that team's invite dialog. The
 * personal workspace has no members of its own (its Members page lists
 * teams), so it goes to the invite dialog of a team the user runs, or to
 * "Create a team" when they run none.
 */
function useInviteHref(enabled: boolean): string {
  const dash = useDashboardPath();
  const teamId = useTeamId();
  const personal = enabled && !teamId;
  const workspaces = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: personal,
  });
  if (!personal) return dash("settings/members?invite=1");
  // Until the list loads (or if it fails) the teams list is a safe landing.
  if (!workspaces.data) return dash("settings/members");
  const teams = workspaces.data.teams.filter((t) => t.isCollaborative);
  const team = teams.find((t) => t.isOwner) ?? teams.find((t) => t.role === "admin");
  return team
    ? `/dashboard/teams/${encodeURIComponent(team.id)}/settings/members?invite=1`
    : "/dashboard/teams/create";
}

/** Where each step's button goes. */
function useSetupStepTarget(id: SetupStepId): { href?: string; onClick?: () => void } {
  const dash = useDashboardPath();
  const inviteHref = useInviteHref(id === "invite");
  switch (id) {
    case "connect":
      return { href: dash("connections?connect=1") };
    case "agent":
      return { href: dash("agents") };
    case "publish":
      return { onClick: () => openComposer() };
    case "schedule":
      return { href: dash("settings/schedule") };
    case "invite":
      return { href: inviteHref };
  }
}

function StepAction({ step, primary }: { step: SetupStep; primary: boolean }) {
  const target = useSetupStepTarget(step.id);
  const cls = cn(
    "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10",
    primary
      ? "bg-accent text-accent-foreground hover:bg-accent-hover"
      : "border border-border bg-bg-elevated text-text hover:bg-bg-muted",
  );
  if (target.href) {
    return (
      <Link href={target.href} className={cls}>
        {ACTION_LABEL[step.id]}
      </Link>
    );
  }
  return (
    <button type="button" onClick={target.onClick} className={cls}>
      {ACTION_LABEL[step.id]}
    </button>
  );
}

/**
 * "Get set up": ticks itself from real state, can be hidden (collapses to the
 * sidebar SetupPill) and retires once every required step is done.
 */
export function SetupChecklist({ data }: { data: DashboardHomeData }) {
  const [visibility, setVisibility] = useSetupVisibility();
  if (!canSeeSetup(data.permissions)) return null;
  const steps = buildSetupSteps(data.setup, data.permissions);
  const progress = setupProgress(steps);
  if (progress.complete || visibility === "dismissed") return null;
  if (visibility === "hidden") {
    // Wide screens show the sidebar SetupPill; below lg there is no sidebar, so offer
    // the way back here.
    return (
      <button
        type="button"
        onClick={() => setVisibility("visible")}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-bg-elevated px-4 py-2.5 text-left text-sm text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:hidden"
      >
        <span>Get set up</span>
        <span className="text-xs text-text-muted">
          {progress.done} of {progress.total} · Show
        </span>
      </button>
    );
  }

  return (
    <section
      aria-labelledby="home-setup-title"
      className="rounded-xl border border-border bg-bg-elevated p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-setup-title" className="text-sm font-semibold text-text">
          Get set up
        </h2>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="tabular-nums">
            {progress.done} of {progress.total}
          </span>
          <button
            type="button"
            onClick={() => setVisibility("hidden")}
            className="rounded px-1 font-medium hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            title="Moves this list to a small pill in the sidebar"
          >
            Hide
          </button>
        </div>
      </div>
      <ol className="mt-3 space-y-0.5">
        {steps.map((step) => {
          const isNext = progress.next?.id === step.id;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-lg px-2 py-2",
                isNext && "bg-bg-muted/60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full",
                  step.done ? "bg-accent text-accent-foreground" : "text-text-subtle",
                )}
              >
                {step.done ? <Check className="size-3" strokeWidth={3} /> : <Circle className="size-[18px]" />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm",
                    step.done ? "text-text-muted line-through" : isNext ? "font-medium text-text" : "text-text",
                  )}
                >
                  <span className="sr-only">{step.done ? "Done: " : "To do: "}</span>
                  {step.title}
                  {step.optional ? <span className="font-normal text-text-muted"> (optional)</span> : null}
                </p>
                {isNext ? <p className="mt-0.5 text-xs text-text-muted">{step.hint}</p> : null}
                {!step.done && !step.actionable && BLOCKED_COPY[step.id] ? (
                  <p className="mt-0.5 text-xs text-text-muted">{BLOCKED_COPY[step.id]}</p>
                ) : null}
              </div>
              {!step.done && step.actionable ? <StepAction step={step} primary={isNext} /> : null}
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setVisibility("dismissed")}
          className="rounded px-1 text-xs text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          I'm set, don't show this again
        </button>
      </div>
    </section>
  );
}

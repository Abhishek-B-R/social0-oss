import { useMemo, useState } from "react";
import { PLAN_NAMES } from "@/lib/plans";
import { useLocation } from "react-router-dom";
import { ChevronRight, Layers, Plus } from "lucide-react";
import Link from "@/components/AppLink";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  ErrorState,
  FilterChips,
  PageContainer,
  PageHeader,
  RowActions,
  Skeleton,
  SkeletonRows,
  Toggle,
  openComposer,
  useDashboardPath,
  useSearchParamState,
} from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsGuest } from "@/lib/use-is-guest";
import { signInUrl } from "@/lib/sign-in-url";
import { cn } from "@/lib/utils";
import type { AutomationRule, RuleInstance } from "./automation-rules";
import { metricWord } from "./automation-rules";
import { AutomationRuleDrawer, type ToggleControl } from "./AutomationRuleDrawer";
import { ConfirmTurnOffDialog, type TurnOffRequest } from "./ConfirmTurnOffDialog";
import { LockedPlanPanel } from "./LockedPlanPanel";
import { LastRunCell, RuleKindIcon, RuleSentence } from "./RuleParts";
import { useAutomations } from "./use-automations";

const NO_ROLE_TITLE = "Your role can't change automations";

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-xl font-semibold tabular-nums tracking-tight",
            tone === "danger" ? "text-danger" : "text-text",
          )}
        >
          {value}
        </span>
        {hint ? <span className="truncate text-xs text-text-muted">{hint}</span> : null}
      </dd>
    </div>
  );
}

// Two even columns on a phone (four stats wrapped 3 + 1 there), one row from sm.
const KPI_ROW = "grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-10";

const NEW_OPTION =
  "block rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/** Copy for turning off something the page can't turn back on. */
function irreversibleCopy(targets: RuleInstance[], rule: AutomationRule): string {
  const n = targets.length;
  const posts = `${n} post${n === 1 ? "" : "s"}`;
  if (rule.kind === "autoplug") {
    const t = rule.threshold ?? 0;
    return `${n === 1 ? "This post" : `These ${posts}`} won't get the reply when they reach ${t.toLocaleString()} ${metricWord(rule.metricType, t)}. To use it again, set up Auto-Plug on the post.`;
  }
  return `Scheduled posts lose this Auto-Repost setting. To use it again, edit the scheduled post. Live reposts can be turned back on here.`;
}

export function AutomationsPage() {
  const dash = useDashboardPath();
  const isGuest = useIsGuest();
  const location = useLocation();
  const { query, data, rules, busyKey, setRuleOn, setInstanceOn } = useAutomations();
  const [kind, setKind] = useSearchParamState("type", "all");
  const [openRuleKey, setOpenRuleKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TurnOffRequest | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  // null = not toggled yet: open by default only when a finished rule failed.
  const [finishedToggled, setFinishedToggled] = useState<boolean | null>(null);

  const filtered = useMemo(
    () => (kind === "all" ? rules : rules.filter((r) => r.kind === kind)),
    [rules, kind],
  );
  const openRule = rules.find((r) => r.key === openRuleKey) ?? null;

  const canEdit = data?.canEdit ?? false;
  const plan = data?.plan;
  const automationsLocked = !!plan && !plan.allowAutoPlug && !plan.allowResurface;

  const requestOff = (
    rule: AutomationRule,
    targets: RuleInstance[],
    run: () => Promise<unknown>,
  ) => {
    const irreversible = targets.some(
      (i) => i.kind === "autoplug" || i.state === "pending",
    );
    if (!irreversible) {
      void run();
      return;
    }
    const n = targets.length;
    setConfirm({
      title:
        n === 1
          ? `Turn off ${rule.kind === "autoplug" ? "Auto-Plug" : "Auto-Repost"} for this post?`
          : `Turn off ${rule.kind === "autoplug" ? "Auto-Plug" : "Auto-Repost"} on ${n} posts?`,
      description: irreversibleCopy(targets, rule),
      confirmLabel: "Turn off",
      onConfirm: run,
    });
  };

  const ruleToggle = (rule: AutomationRule): ToggleControl | null => {
    const busy = busyKey !== null;
    if (rule.on) {
      const targets = rule.instances.filter(
        (i) => i.state === "active" || i.state === "pending",
      );
      return {
        checked: true,
        disabled: !canEdit || busy,
        title: !canEdit ? NO_ROLE_TITLE : undefined,
        onChange: () => requestOff(rule, targets, () => setRuleOn(rule, false)),
      };
    }
    if (rule.canResume) {
      const planOk = plan?.allowResurface ?? false;
      return {
        checked: false,
        disabled: !canEdit || busy || !planOk,
        title: !canEdit
          ? NO_ROLE_TITLE
          : !planOk
            ? `Auto-Repost is available on ${PLAN_NAMES.creator} and up`
            : undefined,
        onChange: () => void setRuleOn(rule, true),
      };
    }
    return null;
  };

  const instanceToggle = (inst: RuleInstance): ToggleControl | null => {
    const busy = busyKey !== null;
    const rule = rules.find((r) => r.instances.includes(inst));
    if (!rule) return null;
    if (inst.state === "active" || inst.state === "pending") {
      return {
        checked: true,
        disabled: !canEdit || busy,
        title: !canEdit ? NO_ROLE_TITLE : undefined,
        onChange: () => requestOff(rule, [inst], () => setInstanceOn(inst, false)),
      };
    }
    if (inst.canResume) {
      const planOk = plan?.allowResurface ?? false;
      return {
        checked: false,
        disabled: !canEdit || busy || !planOk,
        title: !canEdit
          ? NO_ROLE_TITLE
          : !planOk
            ? `Auto-Repost is available on ${PLAN_NAMES.creator} and up`
            : undefined,
        onChange: () => void setInstanceOn(inst, true),
      };
    }
    return null;
  };

  const header = (
    <PageHeader
      title="Automations"
      actions={
        <>
          {!isGuest && !automationsLocked ? (
            <Button
              onClick={() => setNewOpen(true)}
              // Only a role that can't edit disables it; while the page loads
              // it stays a normal button (the dialog only explains options).
              disabled={!!data && !canEdit}
              title={data && !canEdit ? NO_ROLE_TITLE : undefined}
            >
              <Plus aria-hidden />
              New automation
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (isGuest) {
    return (
      <PageContainer>
        {header}
        <EmptyState
          title="Sign in to see your automations"
          description="Auto-Plug and Auto-Repost rules for your X posts show up here, with when they last ran."
          primaryAction={{
            label: "Sign in",
            href: signInUrl(`${location.pathname}${location.search}`),
          }}
        />
      </PageContainer>
    );
  }

  if (query.isError) {
    return (
      <PageContainer>
        {header}
        <ErrorState
          message="Couldn't load your automations."
          detail={query.error instanceof Error ? query.error.message : null}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer stack>
        {header}
        <div aria-busy="true" className="space-y-6">
          <div className={KPI_ROW}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-6 w-10" />
              </div>
            ))}
          </div>
          <SkeletonRows rows={4} />
        </div>
      </PageContainer>
    );
  }

  const stats = data.stats;
  const activeRules = rules.filter((r) => r.on).length;
  const postsCovered = rules.reduce(
    (n, r) => n + r.activeCount + r.pendingCount,
    0,
  );
  const failed = stats.autoPlugsFailed + stats.resurfaceRunsFailed;
  const plugCount = rules.filter((r) => r.kind === "autoplug").length;
  const repostCount = rules.length - plugCount;
  // Running or paused rules stay in the main table; rules that ran to the
  // end (or expired) move under a collapsed "Finished (n)" section.
  const liveRules = filtered.filter((r) => r.on || r.canResume);
  const finishedRules = filtered.filter((r) => !r.on && !r.canResume);
  const finishedFailed = finishedRules.filter((r) => r.lastRunStatus === "failed").length;
  const finishedOpen = finishedToggled ?? finishedFailed > 0;

  const ruleTable = (list: AutomationRule[], finished: boolean) => (
    <DataTable
      aria-label={finished ? "Finished automations" : "Automation rules"}
      // Fixed columns so the live and finished tables line up.
      tableClassName="table-fixed"
    >
      <DataTableHeader>
        <tr>
          <DataTableHead>Rule</DataTableHead>
          <DataTableHead className="hidden w-28 sm:table-cell">Runs</DataTableHead>
          <DataTableHead className="hidden w-40 md:table-cell">Last run</DataTableHead>
          <DataTableHead className="w-20 text-right">
            <span className="sr-only">On or off</span>
          </DataTableHead>
        </tr>
      </DataTableHeader>
      <DataTableBody>
        {list.map((rule) => {
          const control = ruleToggle(rule);
          const posts = rule.instances.length;
          const failedRow = rule.lastRunStatus === "failed";
          const pendingOnly = rule.pendingCount > 0 && rule.activeCount === 0;
          return (
            <DataTableRow
              key={rule.key}
              onActivate={() => setOpenRuleKey(rule.key)}
              tone={failedRow ? "danger" : "default"}
              aria-label={`Open ${rule.kind === "autoplug" ? "Auto-Plug" : "Auto-Repost"} rule`}
            >
              <DataTableCell className="min-w-0 py-3">
                <div className="flex items-start gap-2.5">
                  <RuleKindIcon kind={rule.kind} className="mt-0.5" />
                  <div className="min-w-0">
                    <RuleSentence
                      rule={rule}
                      className={cn(
                        "block text-sm",
                        finished ? "text-text-muted" : "text-text",
                      )}
                    />
                    <p className="mt-0.5 text-xs text-text-muted">
                      {posts} post{posts === 1 ? "" : "s"}
                      {rule.pendingCount > 0
                        ? `, ${rule.pendingCount} waiting to publish`
                        : ""}
                    </p>
                    <div className="mt-1 md:hidden">
                      <LastRunCell
                        lastRunAt={rule.lastRunAt}
                        lastRunStatus={rule.lastRunStatus}
                        nextRunAt={rule.nextRunAt}
                        pendingOnly={pendingOnly}
                      />
                    </div>
                  </div>
                </div>
              </DataTableCell>
              <DataTableCell className="hidden whitespace-nowrap text-[13px] tabular-nums text-text sm:table-cell">
                {rule.runs}
                {rule.failedRuns > 0 ? (
                  <span className="ml-1.5 text-xs text-danger">
                    {rule.failedRuns} failed
                  </span>
                ) : null}
              </DataTableCell>
              <DataTableCell className="hidden md:table-cell">
                <LastRunCell
                  lastRunAt={rule.lastRunAt}
                  lastRunStatus={rule.lastRunStatus}
                  nextRunAt={rule.nextRunAt}
                  pendingOnly={pendingOnly}
                />
              </DataTableCell>
              <DataTableCell className="text-right" data-row-stop>
                <div className="flex items-center justify-end gap-1">
                  {control ? (
                    <span title={control.title}>
                      <Toggle
                        checked={control.checked}
                        disabled={control.disabled}
                        pending={busyKey === rule.key}
                        onCheckedChange={control.onChange}
                        aria-label={
                          control.checked
                            ? "Turn this automation off"
                            : "Turn this automation back on"
                        }
                      />
                    </span>
                  ) : null}
                  <RowActions className="hidden sm:flex">
                    <ChevronRight className="size-4 text-text-muted" aria-hidden />
                  </RowActions>
                </div>
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );

  return (
    <PageContainer stack>
      {header}

      {automationsLocked ? (
        <LockedPlanPanel
          title="Let your X posts keep working after they publish"
          description="Auto-Plug replies with your link once a post takes off. Auto-Repost shares a post again on a schedule so more people see it."
          points={[
            "Reply with your newsletter or product link after a set number of likes",
            "Repost at intervals you choose, up to a limit",
            "See every rule, when it ran and whether it worked, on this page",
          ]}
        />
      ) : null}

      {rules.length > 0 ? (
        <dl className={KPI_ROW} aria-label="Automation stats">
          <Kpi
            label="Active rules"
            value={activeRules}
            hint={postsCovered > 0 ? `on ${postsCovered} post${postsCovered === 1 ? "" : "s"}` : undefined}
          />
          <Kpi label="Plugs posted" value={stats.autoPlugsTriggered} />
          <Kpi label="Reposts done" value={stats.resurfaceRunsDone} />
          <Kpi label="Failed" value={failed} tone={failed > 0 ? "danger" : "default"} />
        </dl>
      ) : null}

      {rules.length === 0 ? (
        automationsLocked ? null : (
          <EmptyState
            icon={<Layers />}
            title="No automations yet"
            description="Turn on Auto-Plug or Auto-Repost when you schedule a post to X. Each rule shows up here with its runs."
          />
        )
      ) : (
        <section aria-label="Rules" className="space-y-3">
          <FilterChips
            param="type"
            aria-label="Filter rules by type"
            options={[
              { value: "autoplug", label: "Auto-Plug", count: plugCount },
              { value: "repost", label: "Auto-Repost", count: repostCount },
            ]}
          />
          {filtered.length === 0 ? (
            <EmptyState
              compact
              title="No rules of this type"
              secondaryAction={{ label: "Show all", onClick: () => setKind(null) }}
            />
          ) : (
            <>
              {liveRules.length > 0 ? (
                ruleTable(liveRules, false)
              ) : (
                <p className="text-sm text-text-muted">Nothing running right now.</p>
              )}
              {finishedRules.length > 0 ? (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setFinishedToggled(!finishedOpen)}
                    aria-expanded={finishedOpen}
                    aria-controls="automations-finished"
                    className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <ChevronRight
                      className={cn(
                        "size-4 transition-transform motion-reduce:transition-none",
                        finishedOpen && "rotate-90",
                      )}
                      aria-hidden
                    />
                    Finished
                    <span className="tabular-nums font-normal">({finishedRules.length})</span>
                    {finishedFailed > 0 ? (
                      <span className="tabular-nums font-normal text-danger">
                        · {finishedFailed} failed
                      </span>
                    ) : null}
                  </button>
                  {finishedOpen ? (
                    <div id="automations-finished" className="mt-2">
                      {ruleTable(finishedRules, true)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
          {!canEdit ? (
            <p className="text-xs text-text-muted">
              You can see automations in this workspace, but your role can't
              turn them on or off.
            </p>
          ) : null}
        </section>
      )}

      <AutomationRuleDrawer
        rule={openRule}
        open={!!openRule}
        onOpenChange={(o) => !o && setOpenRuleKey(null)}
        ruleToggle={ruleToggle}
        instanceToggle={instanceToggle}
      />

      <ConfirmTurnOffDialog request={confirm} onClose={() => setConfirm(null)} />

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New automation</DialogTitle>
            <DialogDescription>
              Automations are set on each X post. Turn on Auto-Plug or
              Auto-Repost in the post's X settings, and the rule appears here.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-2 grid gap-0.5">
            <button
              type="button"
              onClick={() => {
                setNewOpen(false);
                openComposer();
              }}
              className={NEW_OPTION}
            >
              <span className="block text-sm font-medium text-text">Write a new X post</span>
              <span className="block text-xs text-text-muted">
                Pick an X account, then turn on Auto-Plug or Auto-Repost.
              </span>
            </button>
            <Link
              href={dash("posts?tab=published")}
              onClick={() => setNewOpen(false)}
              className={NEW_OPTION}
            >
              <span className="block text-sm font-medium text-text">Add to a published post</span>
              <span className="block text-xs text-text-muted">
                Open a recent X post and turn it on from its automations section.
              </span>
            </Link>
            <Link
              href={dash("bulk-tools")}
              onClick={() => setNewOpen(false)}
              className={NEW_OPTION}
            >
              <span className="block text-sm font-medium text-text">Use it on many posts</span>
              <span className="block text-xs text-text-muted">
                Bulk import with an X account selected applies one rule to every post.
              </span>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

export default AutomationsPage;

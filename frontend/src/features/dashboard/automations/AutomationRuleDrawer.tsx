import { ExternalLink } from "lucide-react";
import Link from "@/components/AppLink";
import { Drawer, Toggle, useDashboardPath } from "@/components/app";
import { relativeTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import {
  RULE_KIND_LABEL,
  absoluteTime,
  type AutomationRule,
  type RuleInstance,
} from "./automation-rules";
import { LastRunCell, RuleSentence } from "./RuleParts";

export type ToggleControl = {
  checked: boolean;
  disabled: boolean;
  title?: string;
  onChange: (next: boolean) => void;
};

/**
 * One rule's posts: each post's status, last/next run, and its own on/off.
 * Opened by clicking a rule row.
 */
export function AutomationRuleDrawer({
  rule,
  open,
  onOpenChange,
  ruleToggle,
  instanceToggle,
}: {
  rule: AutomationRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleToggle: (rule: AutomationRule) => ToggleControl | null;
  instanceToggle: (inst: RuleInstance) => ToggleControl | null;
}) {
  const dash = useDashboardPath();
  const control = rule ? ruleToggle(rule) : null;

  return (
    <Drawer
      open={open && !!rule}
      onOpenChange={onOpenChange}
      width="lg"
      title={rule ? RULE_KIND_LABEL[rule.kind] : "Automation"}
      description={rule ? <RuleSentence rule={rule} full /> : undefined}
      headerActions={
        control ? (
          <span title={control.title} className="inline-flex items-center gap-2">
            <span className="text-xs text-text-muted">
              {control.checked ? "On" : "Off"}
            </span>
            <Toggle
              checked={control.checked}
              disabled={control.disabled}
              onCheckedChange={control.onChange}
              aria-label={
                control.checked
                  ? "Turn this automation off on every post"
                  : "Turn this automation back on"
              }
            />
          </span>
        ) : null
      }
    >
      {rule ? (
        <div className="space-y-5 px-5 py-4">
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="text-xs text-text-muted">
                {rule.kind === "autoplug" ? "Plugs posted" : "Reposts done"}
              </dt>
              <dd className="mt-0.5 text-base font-semibold tabular-nums text-text">
                {rule.runs}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Failed</dt>
              <dd
                className={cn(
                  "mt-0.5 text-base font-semibold tabular-nums",
                  rule.failedRuns > 0 ? "text-danger" : "text-text",
                )}
              >
                {rule.failedRuns}
              </dd>
            </div>
          </dl>

          <section aria-label="Posts using this automation">
            <h3 className="mb-1 text-xs font-medium text-text-muted">
              Posts <span className="tabular-nums font-normal">({rule.instances.length})</span>
            </h3>
            <ul className="divide-y divide-border border-y border-border">
              {rule.instances.map((inst) => {
                const t = instanceToggle(inst);
                const scheduled = relativeTime(inst.scheduledAt);
                return (
                  <li key={inst.key} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={dash(`posts/${inst.postId}`)}
                        className="group inline-flex max-w-full items-center gap-1 text-sm font-medium text-text hover:text-accent"
                      >
                        <span className="truncate">
                          {inst.postSnippet || "Untitled post"}
                        </span>
                        <ExternalLink
                          className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </Link>
                      <p className="mt-0.5 text-xs text-text-muted">
                        <span className={cn(inst.state === "failed" && "text-danger")}>
                          {inst.statusLabel}
                        </span>
                        {inst.handle ? <> · @{inst.handle}</> : null}
                        {inst.state === "pending" && scheduled ? (
                          <span title={absoluteTime(inst.scheduledAt)}>
                            {" "}
                            · publishes {scheduled}
                          </span>
                        ) : null}
                      </p>
                      {inst.state !== "pending" ? (
                        <div className="mt-1">
                          <LastRunCell
                            lastRunAt={inst.lastRunAt}
                            lastRunStatus={inst.lastRunStatus}
                            nextRunAt={inst.state === "active" ? inst.nextRunAt : null}
                          />
                        </div>
                      ) : null}
                    </div>
                    {t ? (
                      <span title={t.title} className="shrink-0 pt-0.5">
                        <Toggle
                          checked={t.checked}
                          disabled={t.disabled}
                          onCheckedChange={t.onChange}
                          aria-label={`${t.checked ? "Turn off" : "Turn on"} for “${inst.postSnippet || "this post"}”`}
                        />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="space-y-1 text-xs text-text-muted">
            {rule.instances.some((i) => i.state === "failed") ? (
              <p>
                For a failed post, open it to see what went wrong. If the X
                account was signed out, reconnect it from Accounts.
              </p>
            ) : null}
            <p>
              To change the threshold or reply text, open the post and edit
              its automations there.
            </p>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

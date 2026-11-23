import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { Check, Minus } from "lucide-react";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDashboardPath } from "@/components/app";
import { loadDashboardLayoutData } from "@/api/dashboard-data";
import {
  AGENCY_INCLUDED_ACCOUNTS,
  getPlanLimits,
  PLAN_NAMES,
  type SellablePlanTier,
  type SubscriptionTier,
} from "@/lib/plans";
import { AGENCY_EXTRA_ACCOUNT_PRICE, formatMoney, getPlanPrice } from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";
import {
  accountsLabel,
  isUnlimitedAccounts,
  planName,
  toSubscriptionTier,
} from "./plan-catalog";
import { recommendedPlanFor, type LimitReason } from "./limit-reasons";

export type { LimitReason } from "./limit-reasons";

export type LimitModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: LimitReason;
  /**
   * Current plan id ("free" | "creator" | "agency" | legacy). Omit to read it from the
   * dashboard layout query (same cache the sidebar uses).
   */
  currentTier?: string | null;
  /** How many of the limited thing they have now (e.g. 5 connected accounts). */
  used?: number;
  /** Replace the generated title / reason line. */
  title?: ReactNode;
  description?: ReactNode;
  /**
   * Override the CTA. Default: go to Billing and start the upgrade to the
   * recommended plan (`billing?upgrade=<plan>`).
   */
  onUpgrade?: (plan: SellablePlanTier) => void;
};

const CREATOR = PLAN_NAMES.creator;
const AGENCY = PLAN_NAMES.agency;
const EXTRA_MONTHLY = formatMoney(AGENCY_EXTRA_ACCOUNT_PRICE.monthly);

function ordinal(n: number): string {
  const words = ["", "1st", "2nd", "3rd"];
  if (n > 0 && n < 4) return words[n];
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  return `${n}${mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th"}`;
}

/** Extra things the next plan unlocks beyond the limit itself. */
function extrasLine(from: SubscriptionTier, to: SubscriptionTier, skip: LimitReason): string {
  const a = getPlanLimits(from);
  const b = getPlanLimits(to);
  const parts: string[] = [];
  if (!a.allowBulkTools && b.allowBulkTools && skip !== "bulk_tools") parts.push("bulk tools");
  if (!a.allowAutoPlug && b.allowAutoPlug && skip !== "autoplug") parts.push("auto-plug");
  if (!a.allowResurface && b.allowResurface && skip !== "resurface") parts.push("auto-repost");
  if (!a.allowTeams && b.allowTeams && skip !== "teams") parts.push("teammates");
  if (parts.length === 0) return "";
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `, plus ${list}`;
}

function accountsGive(tier: SubscriptionTier): string {
  const n = getPlanLimits(tier).maxConnectedAccounts;
  return isUnlimitedAccounts(n) ? "unlimited accounts" : `${n} accounts`;
}

type Copy = { title: string; line: string; feature: string | null };

function buildCopy(
  reason: LimitReason,
  tier: SubscriptionTier,
  next: SellablePlanTier | null,
  used: number | undefined,
): Copy {
  const cur = planName(tier);
  const nxt = next ? planName(next) : null;
  const extras = next ? extrasLine(tier, next, reason) : "";
  const freePosts = getPlanLimits("free").maxFreePosts;
  switch (reason) {
    case "accounts": {
      const limit = getPlanLimits(tier).maxConnectedAccounts;
      const count = used ?? limit;
      return {
        title: `Connect a ${ordinal(count + 1)} account`,
        line:
          tier === "agency"
            ? `${cur} connects any number of accounts: each one over ${AGENCY_INCLUDED_ACCOUNTS} adds $${EXTRA_MONTHLY}/month. You've reached our safety limit, so talk to us and we'll raise it.`
            : nxt
              ? `${cur} includes ${accountsGive(tier)}. ${nxt} gives you ${
                  next === "agency"
                    ? `${AGENCY_INCLUDED_ACCOUNTS} accounts, then $${EXTRA_MONTHLY}/month for each one over, added to your bill as you connect. No cap`
                    : accountsGive(next!)
                }${extras}.`
              : `${cur} includes ${accountsGive(tier)}. Talk to us if you need more.`,
        feature: null,
      };
    }
    case "free_posts":
      return {
        title: `You've used your ${freePosts} free posts`,
        line: `Free includes ${freePosts} posts. ${nxt ?? CREATOR} gives you unlimited posts on all 9 platforms${extras}. Drafts still save.`,
        feature: "Unlimited posts",
      };
    case "bulk_tools":
      return {
        title: `Bulk scheduling is on ${nxt ?? CREATOR}`,
        line: `Upload a batch of images or videos and schedule them in one go. ${nxt ?? CREATOR} also gives you ${next ? accountsGive(next) : "more accounts"}${extras}.`,
        feature: "Bulk image & video scheduling",
      };
    case "autoplug":
      return {
        title: `Auto-plug is on ${nxt ?? CREATOR}`,
        line: `Auto-plug replies to your post with a call to action once it takes off. ${nxt ?? CREATOR} also gives you ${next ? accountsGive(next) : "more accounts"}${extras}.`,
        feature: "Auto-plug",
      };
    case "resurface":
      return {
        title: `Auto-repost is on ${nxt ?? CREATOR}`,
        line: `Auto-repost brings a post back on a schedule so new followers see it. ${nxt ?? CREATOR} also gives you ${next ? accountsGive(next) : "more accounts"}${extras}.`,
        feature: "Auto-repost / resurface",
      };
    case "teams":
      return {
        title: `Inviting teammates is on ${nxt ?? AGENCY}`,
        line: `${nxt ?? AGENCY} gives you a shared workspace with teammates and ${next ? accountsGive(next) : "more accounts"}${next === "agency" ? `, then +$${EXTRA_MONTHLY}/month per extra account` : ""}.`,
        feature: "Team collaboration",
      };
    case "workspaces":
      return {
        title: "More workspaces need a paid plan",
        line: `Keep each brand's accounts and schedule apart. ${nxt ?? CREATOR} gives you workspaces and ${next ? accountsGive(next) : "more accounts"}${extras}.`,
        feature: "Workspaces (multi-brand)",
      };
  }
}

function hasFeature(reason: LimitReason, tier: SubscriptionTier): boolean {
  const l = getPlanLimits(tier);
  switch (reason) {
    case "free_posts":
      return tier !== "free";
    case "bulk_tools":
      return l.allowBulkTools;
    case "autoplug":
      return l.allowAutoPlug;
    case "resurface":
      return l.allowResurface;
    case "teams":
      return l.allowTeams;
    case "workspaces":
      return l.allowMultiWorkspace;
    default:
      return true;
  }
}

function PlanColumn({
  eyebrow,
  tier,
  reason,
  feature,
  recommended,
}: {
  eyebrow: string;
  tier: SubscriptionTier;
  reason: LimitReason;
  feature: string | null;
  recommended?: boolean;
}) {
  const price = tier === "free" ? null : getPlanPrice(tier, "monthly");
  const included = hasFeature(reason, tier);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border p-3.5",
        recommended
          ? "border-accent bg-accent/5 ring-1 ring-accent"
          : "border-border bg-bg-elevated",
      )}
    >
      <span
        className={cn(
          "text-xs font-medium",
          recommended ? "text-accent" : "text-text-muted",
        )}
      >
        {eyebrow}
      </span>
      <span className="text-base font-semibold text-text">{planName(tier)}</span>
      <span className="text-sm text-text">
        {tier === "free" && reason === "free_posts"
          ? `${getPlanLimits("free").maxFreePosts} posts`
          : tier === "agency"
            ? `${AGENCY_INCLUDED_ACCOUNTS} accounts, then $${EXTRA_MONTHLY}/mo each`
            : accountsLabel(tier)}
      </span>
      {feature && reason !== "free_posts" ? (
        <span
          className={cn(
            "flex items-center gap-1 text-xs",
            included ? "text-text" : "text-text-muted",
          )}
        >
          {included ? (
            <Check className="size-3.5 shrink-0 text-ok" aria-hidden />
          ) : (
            <Minus className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">
            {feature}
            <span className="sr-only">{included ? " included" : " not included"}</span>
          </span>
        </span>
      ) : null}
      {feature && reason === "free_posts" && tier !== "free" ? (
        <span className="flex items-center gap-1 text-xs text-text">
          <Check className="size-3.5 shrink-0 text-ok" aria-hidden />
          {feature}
        </span>
      ) : null}
      <span className="mt-1 text-sm font-semibold tabular-nums text-text">
        {price ? (
          <>
            ${formatMoney(price.price)}/mo
          </>
        ) : (
          "$0"
        )}
      </span>
    </div>
  );
}

/**
 * Shown at the moment a plan limit blocks an action (connect a 6th account,
 * free posts used up, bulk tools locked…). One reason line, your plan vs the
 * plan that fixes it, one button. Never shown pre-emptively.
 */
export function LimitModal({
  open,
  onOpenChange,
  reason,
  currentTier,
  used,
  title,
  description,
  onUpgrade,
}: LimitModalProps) {
  const dash = useDashboardPath();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const needsTier = currentTier === undefined;
  const { data: layout } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    enabled: open && needsTier,
    retry: false,
    staleTime: 60_000,
  });
  // Don't guess "Free" while the plan is still loading: wrong copy is worse than a beat of blank.
  const tierKnown = !needsTier || layout != null;
  const tier = toSubscriptionTier(needsTier ? layout?.subscriptionTier : currentTier);
  const next = recommendedPlanFor(reason, tier);
  const copy = useMemo(() => buildCopy(reason, tier, next, used), [reason, tier, next, used]);

  const upgrade = () => {
    if (!next) return;
    posthog?.capture("limit_modal_upgrade_clicked", {
      reason,
      current_plan: tier,
      plan: next,
    });
    onOpenChange(false);
    if (onUpgrade) {
      onUpgrade(next);
      return;
    }
    navigate(dash(`billing?upgrade=${next}`));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="pr-8 text-lg font-semibold tracking-tight">
            {title ?? (tierKnown ? copy.title : "Checking your plan…")}
          </DialogTitle>
          <DialogDescription className="text-sm text-text-muted">
            {description ?? (tierKnown ? copy.line : "One moment.")}
          </DialogDescription>
        </DialogHeader>

        {next && tierKnown ? (
          <div className="grid grid-cols-2 gap-2.5">
            <PlanColumn
              eyebrow="You're on"
              tier={tier}
              reason={reason}
              feature={copy.feature}
            />
            <PlanColumn
              eyebrow="Recommended"
              tier={next}
              reason={reason}
              feature={copy.feature}
              recommended
            />
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={dash("billing?view=plans")}
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 items-center justify-center rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
          >
            See all plans
          </Link>
          {next || !tierKnown ? (
            <Button onClick={upgrade} disabled={!tierKnown} className="touch:h-11">
              {next === "agency" && reason === "accounts"
                ? `Move to ${planName(next)}`
                : next
                  ? `Upgrade to ${planName(next)}`
                  : "Upgrade"}
            </Button>
          ) : (
            <Button asChild>
              <a href="https://cal.com/abhishekbr/30min" target="_blank" rel="noopener noreferrer">
                Talk to us
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

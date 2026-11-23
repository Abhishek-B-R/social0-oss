import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import { PlanDiscountPrice } from "@/components/billing/PlanDiscountPrice";
import {
  SELLABLE_PLANS,
  PLAN_FEATURES,
  PLAN_HIGHLIGHTS,
  defaultAgencyAccounts,
  legacyPlanSummary,
  nextPlanAbove,
  planName,
  shortPrice,
  tierRank,
} from "@/components/billing/plan-catalog";
import {
  AGENCY_INCLUDED_ACCOUNTS,
  CREATOR_ACCOUNTS,
  isLegacyTier,
  type BillingInterval,
  type PaidPlanTier,
  type SellablePlanTier,
  type SubscriptionTier,
} from "@/lib/plans";
import {
  AGENCY_EXTRA_ACCOUNT_NOTE,
  agencyExtraAccounts,
  formatMoney,
  planPriceForAccounts,
} from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";

type PlansGridProps = {
  tier: SubscriptionTier;
  /** Agency only: paid extras on the current subscription. */
  extraAccounts: number;
  /** Accounts connected now (Agency bills those above 59; warns on Creator). */
  connectedAccounts: number;
  /** Interval the user pays today (paid plans). */
  currentInterval: BillingInterval;
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
  /** Plan to ring as "Recommended" (from a limit moment / `?upgrade=`). */
  highlight: SellablePlanTier | null;
  pendingPlanTier: PaidPlanTier | null;
  renewalDate: string | null;
  loadingPlan: PaidPlanTier | null;
  upgradePending: boolean;
  onUpgrade: (plan: SellablePlanTier, extraAccounts: number) => void;
  onDowngrade: (plan: SellablePlanTier, extraAccounts: number) => void;
  onSwitchInterval: (plan: PaidPlanTier) => void;
  onClose?: () => void;
};

/** Yearly price as a per-month figure, rounded up to the cent. */
function perMonth(yearly: number): string {
  return formatMoney(Math.ceil((yearly * 100) / 12) / 100);
}

export function PlansGrid({
  tier,
  extraAccounts,
  connectedAccounts,
  currentInterval,
  interval,
  onIntervalChange,
  highlight,
  pendingPlanTier,
  renewalDate,
  loadingPlan,
  upgradePending,
  onUpgrade,
  onDowngrade,
  onSwitchInterval,
  onClose,
}: PlansGridProps) {
  const [showAll, setShowAll] = useState(false);
  // Agency bills what is connected, never a number picked up front.
  const agencyAccounts =
    tier === "agency"
      ? AGENCY_INCLUDED_ACCOUNTS + extraAccounts
      : defaultAgencyAccounts(connectedAccounts);
  const headingId = useId();
  const busy = loadingPlan !== null;
  const legacy = isLegacyTier(tier) ? tier : null;

  return (
    <section aria-labelledby={headingId} className="scroll-mt-6" id="plans">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold tracking-tight text-text">
            {tier === "free" ? "Choose a plan" : "Change plan"}
          </h2>
          <p className="text-sm text-text-muted">
            {tier === "free"
              ? "Unlimited posts on every plan. Cancel anytime."
              : "Upgrades can start now or at renewal. Downgrades start at renewal."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BillingIntervalToggle value={interval} onChange={onIntervalChange} size="sm" />
          {onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Hide plans
            </Button>
          ) : null}
        </div>
      </div>

      {legacy ? (
        <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">
              {planName(legacy)}{" "}
              <span className="font-normal text-text-muted">
                · {shortPrice(legacy, interval)}
              </span>
              <span className="ml-2 rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                Your plan
              </span>
            </p>
            <p className="mt-0.5 text-[13px] text-text-muted">
              {legacyPlanSummary(legacy)}. No longer sold: you keep it and its price as long as
              you stay subscribed.
            </p>
          </div>
          {currentInterval !== interval ? (
            <Button
              size="sm"
              className="shrink-0"
              disabled={busy || upgradePending}
              onClick={() => onSwitchInterval(legacy)}
            >
              {loadingPlan === legacy ? "Loading…" : `Switch to ${interval}`}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="shrink-0" disabled>
              Current plan
            </Button>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SELLABLE_PLANS.map((plan) => {
          const isAgency = plan === "agency";
          const isCurrent = plan === tier;
          const accounts = isAgency ? agencyAccounts : CREATOR_ACCOUNTS;
          const extras = isAgency ? agencyExtraAccounts(accounts) : 0;
          const price = planPriceForAccounts(plan, accounts, interval);
          const rank = tierRank(plan);
          const curRank = tierRank(tier);
          const isHighlight = highlight === plan && !isCurrent;
          const isPending = pendingPlanTier === plan;
          const loading = loadingPlan === plan;
          const highlights = PLAN_HIGHLIGHTS[plan];
          const isUpgrade = tier === "free" || rank > curRank;

          let cta: ReactNode;
          if (isCurrent) {
            cta =
              currentInterval !== interval ? (
                <Button
                  className="w-full"
                  disabled={busy || upgradePending}
                  onClick={() => onSwitchInterval(plan)}
                >
                  {loading ? "Loading…" : `Switch to ${interval}`}
                </Button>
              ) : (
                <Button className="w-full" variant="outline" disabled>
                  Current plan
                </Button>
              );
          } else if (isPending) {
            cta = (
              <Button className="w-full" variant="outline" disabled>
                Starts {renewalDate ?? "at renewal"}
              </Button>
            );
          } else if (isUpgrade) {
            const primary = plan === (highlight ?? nextPlanAbove(tier));
            cta = (
              <Button
                className="w-full"
                variant={primary ? "default" : "outline"}
                disabled={busy || (tier !== "free" && upgradePending)}
                onClick={() => onUpgrade(plan, extras)}
              >
                {loading
                  ? "Loading…"
                  : tier === "free"
                    ? `Choose ${planName(plan)}`
                    : `Upgrade to ${planName(plan)}`}
              </Button>
            );
          } else {
            cta = (
              <Button
                className="w-full"
                variant="ghost"
                disabled={busy || upgradePending}
                onClick={() => onDowngrade(plan, extras)}
              >
                {legacy ? `Move to ${planName(plan)}` : `Downgrade to ${planName(plan)}`}
              </Button>
            );
          }

          return (
            <div
              key={plan}
              className={cn(
                "relative flex min-w-0 flex-col rounded-2xl border bg-bg-elevated p-5",
                isCurrent
                  ? "border-accent/40 bg-accent/5"
                  : isHighlight
                    ? "border-accent ring-1 ring-accent"
                    : "border-border",
              )}
            >
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text">{planName(plan)}</span>
                {isCurrent ? (
                  <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                    Your plan
                  </span>
                ) : isHighlight ? (
                  <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                    Recommended
                  </span>
                ) : isPending ? (
                  <span className="rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-medium text-info">
                    Scheduled
                  </span>
                ) : null}
              </div>
              <p className="mb-3 text-xs text-text-muted">{highlights.tagline}</p>
              <PlanDiscountPrice
                amount={price}
                period={interval === "yearly" ? "/year" : "/month"}
                size="sm"
              />
              <p className="mt-1 h-4 text-xs text-text-muted">
                {interval === "yearly" ? `≈ $${perMonth(price)}/month, 2 months free` : ""}
              </p>

              {isAgency ? (
                <p className="mt-4 text-xs text-text-muted">
                  {AGENCY_INCLUDED_ACCOUNTS} accounts included. {AGENCY_EXTRA_ACCOUNT_NOTE}
                  {!isCurrent && agencyExtraAccounts(agencyAccounts) > 0
                    ? ` Your ${connectedAccounts} connected accounts start at ${agencyExtraAccounts(agencyAccounts)} extra.`
                    : ""}
                </p>
              ) : null}

              {plan === "creator" && !isCurrent && connectedAccounts > CREATOR_ACCOUNTS ? (
                <p className="mt-3 text-xs text-warning">
                  You have {connectedAccounts} accounts connected. {planName("creator")} holds{" "}
                  {CREATOR_ACCOUNTS}.
                </p>
              ) : null}

              <p className="mt-4 text-xs font-medium text-text-muted">{highlights.lead}</p>
              <ul className="mt-2 flex-1 space-y-1.5 text-sm text-text">
                {(showAll ? PLAN_FEATURES[plan] : highlights.items).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 space-y-2">
                {cta}
                {isAgency && tier !== "agency" ? (
                  <a
                    href="https://cal.com/abhishekbr/30min"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl px-3 py-2 text-center text-sm font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    Prefer a walkthrough?
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {showAll ? "Show highlights only" : "Compare every feature"}
          <ChevronDown
            className={cn(
              "size-4 transition-transform motion-reduce:transition-none",
              showAll && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>
    </section>
  );
}

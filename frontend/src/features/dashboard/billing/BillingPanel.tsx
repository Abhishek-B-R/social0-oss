import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { CreditCard, FileText, PauseCircle, RotateCcw, XCircle } from "lucide-react";
import { Banner, Meter } from "@/components/app";
import { Button } from "@/components/ui/button";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { fetchApi } from "@/lib/fetch-api";
import { formatDate } from "@/lib/date-format";
import {
  AGENCY_INCLUDED_ACCOUNTS,
  getPlanLimits,
  isLegacyTier,
  isSellableTier,
  PLAN_NAMES,
  type BillingInterval,
  type PaidPlanTier,
  type SellablePlanTier,
} from "@/lib/plans";
import {
  AGENCY_EXTRA_ACCOUNT_NOTE,
  AGENCY_EXTRA_ACCOUNT_PRICE,
  agencyExtraAccounts,
  formatMoney,
} from "@/lib/plan-pricing";
import type { SubscriptionState } from "@/lib/subscription";
import type { AccountLimitResult } from "@/lib/plan-limits";
import {
  defaultAgencyAccounts,
  isPaidPlan,
  isUnlimitedAccounts,
  legacyPlanSummary,
  nextPlanAbove,
  periodPrice,
  planName,
  shortPrice,
  tierRank,
} from "@/components/billing/plan-catalog";
import { cn } from "@/lib/utils";
import { BillingMenu, type BillingMenuItem } from "./BillingMenu";
import {
  CancelDialog,
  DowngradeDialog,
  SwitchIntervalDialog,
  UpgradeTimingDialog,
} from "./BillingDialogs";
import { PlansGrid } from "./PlansGrid";
import { useBillingFlows } from "./use-billing-flows";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 45; // ~1.5 min
/** Where a brand-new subscriber lands once the plan is confirmed. */
const AFTER_SUBSCRIBE_PATH = "/dashboard/new";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FreePostsUsage = { remaining: number; limit: number };

type BillingPanelProps = {
  subscription: SubscriptionState;
  accountLimit: AccountLimitResult;
  /** Free plan only: lifetime free posts left (from the layout query). */
  freePosts?: FreePostsUsage | null;
  justSubscribed?: boolean;
  dateFormat?: string | null;
  timezone?: string | null;
  /** Reload billing page local state after mutations (RQ alone is not enough). */
  onBillingUpdated?: () => void | Promise<void>;
};

function scrollToPlans() {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => {
    document
      .getElementById("plans")
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });
}

/**
 * Billing A · usage-first. Plan card (plan, price, renewal, Change plan, ⋯),
 * usage meters, yearly nudge, invoices; the plans grid lives behind
 * "Change plan". All provider flows are in `useBillingFlows`.
 */
export function BillingPanel({
  subscription,
  accountLimit,
  freePosts = null,
  justSubscribed = false,
  dateFormat = "dd/MM/yyyy",
  timezone,
  onBillingUpdated,
}: BillingPanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const invalidateQueries = useInvalidateQueries();
  const posthog = usePostHog();

  const refreshBilling = useCallback(() => {
    invalidateQueries();
    void onBillingUpdated?.();
  }, [invalidateQueries, onBillingUpdated]);

  const tier = subscription.tier;
  const paid = isPaidPlan(tier);
  const legacy = isLegacyTier(tier) ? tier : null;
  /** Agency only: paid accounts above the 59 included. */
  const extraAccounts = tier === "agency" ? Math.max(0, subscription.extraAccounts ?? 0) : 0;
  const currentInterval: BillingInterval =
    subscription.interval === "yearly" ? "yearly" : "monthly";

  const renewalDate = subscription.expiresAt
    ? formatDate(subscription.expiresAt, dateFormat, timezone)
    : null;

  const flows = useBillingFlows({ subscription, renewalDate, refreshBilling });

  // ---- URL state ----------------------------------------------------------
  const successParam = searchParams.get("success");
  const statusParam = searchParams.get("status");
  const upgradeParam = searchParams.get("upgrade");
  const viewParam = searchParams.get("view");
  const plansOpen = viewParam === "plans" || upgradeParam === "1";
  // Choice carried over from the public pricing page
  // (`?view=plans&plan=agency&interval=yearly&accounts=100`).
  const planParam = searchParams.get("plan");
  const intervalParam = searchParams.get("interval");

  const [interval, setGridInterval] = useState<BillingInterval>(
    intervalParam === "yearly" || intervalParam === "monthly"
      ? intervalParam
      : paid
        ? currentInterval
        : "monthly",
  );
  const [highlight, setHighlight] = useState<SellablePlanTier | null>(() => {
    const wanted = isSellableTier(upgradeParam) ? upgradeParam : planParam;
    return isSellableTier(wanted) && tierRank(wanted) > tierRank(tier) ? wanted : null;
  });
  const [verifying, setVerifying] = useState(
    successParam === "1" && statusParam !== "failed",
  );
  const [waitingForWebhook, setWaitingForWebhook] = useState(
    Boolean(justSubscribed && tier === "free"),
  );

  const [downgradeTarget, setDowngradeTarget] = useState<{
    plan: SellablePlanTier;
    extraAccounts: number;
  } | null>(null);
  const [switchTarget, setSwitchTarget] = useState<{
    plan: PaidPlanTier;
    to: BillingInterval;
  } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const setPlansOpen = useCallback(
    (open: boolean, opts?: { highlight?: SellablePlanTier | null }) => {
      if (opts && "highlight" in opts) setHighlight(opts.highlight ?? null);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete("upgrade");
          if (open) p.set("view", "plans");
          else p.delete("view");
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Bring the grid into view whenever it opens (button, `?view=plans`, `?upgrade=`).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (plansOpen && !wasOpenRef.current) scrollToPlans();
    wasOpenRef.current = plansOpen;
  }, [plansOpen]);

  // ---- Return from checkout (?success=1): confirm the plan really changed --
  useEffect(() => {
    if (successParam === "1" && statusParam === "failed") {
      navigate("/dashboard/billing", { replace: true });
      toast.error("Payment didn't go through. Try again or use a different card.");
      return;
    }
    if (successParam !== "1") return;
    let cancelled = false;
    void (async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await fetchApi("/api/billing/sync", { method: "POST" }).catch(() => undefined);
        if (cancelled) return;
        refreshBilling();
        await sleep(attempt < 3 ? 3500 : 1500);
        if (cancelled) return;
      }
      setVerifying(false);
      navigate("/dashboard/billing", { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [successParam, statusParam, navigate, refreshBilling]);

  // ---- First subscription: wait for the webhook, then start posting --------
  useEffect(() => {
    if (!waitingForWebhook) return;
    let attempts = 0;
    let stopped = false;
    let inFlight = false;

    const trySyncAndCheck = async () => {
      try {
        // Sync from Dodo by email (works even when the webhook didn't reach us).
        const syncRes = await fetchApi("/api/billing/sync", { method: "POST" });
        const syncData = (await syncRes.json().catch(() => ({}))) as {
          ok?: boolean;
          tier?: string;
        };
        if (syncData?.ok === true && isPaidPlan(syncData.tier)) return true;
        const checkRes = await fetchApi("/api/auth/subscription-check");
        if (!checkRes.ok) return false;
        const checkData = (await checkRes.json().catch(() => ({}))) as {
          hasSubscription?: boolean;
        };
        return checkData.hasSubscription === true;
      } catch {
        return false;
      }
    };

    const run = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      attempts++;
      const done = await trySyncAndCheck();
      inFlight = false;
      if (stopped) return;
      if (done) {
        stopped = true;
        window.location.href = AFTER_SUBSCRIBE_PATH;
        return;
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopped = true;
        setWaitingForWebhook(false);
        refreshBilling();
      }
    };

    void run();
    const id = window.setInterval(() => void run(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [waitingForWebhook, refreshBilling]);

  // ---- `?upgrade=<plan>` from LimitModal: open the grid and start the upgrade.
  // Only Creator / Agency start an upgrade; an old plan name just opens the grid.
  const upgradeStartedRef = useRef(false);
  const { startUpgrade } = flows;
  const connectedNow = accountLimit.currentTotal;
  useEffect(() => {
    if (upgradeStartedRef.current) return;
    if (!isPaidPlan(upgradeParam)) return;
    if (waitingForWebhook || verifying) return;
    upgradeStartedRef.current = true;
    const plan = upgradeParam;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("upgrade");
        p.set("view", "plans");
        return p;
      },
      { replace: true },
    );
    if (isSellableTier(plan) && tierRank(plan) > tierRank(tier)) {
      const extras =
        plan === "agency" ? agencyExtraAccounts(defaultAgencyAccounts(connectedNow)) : 0;
      void startUpgrade(plan, interval, extras);
    }
  }, [
    upgradeParam,
    waitingForWebhook,
    verifying,
    setSearchParams,
    startUpgrade,
    tier,
    interval,
    connectedNow,
  ]);

  // ---- Interstitial states -------------------------------------------------
  if (waitingForWebhook) {
    return (
      <div
        role="status"
        className="py-10 text-center"
      >
        <h2 className="text-lg font-semibold text-text">Setting up your subscription</h2>
        <p className="mt-2 text-sm text-text-muted">
          We&apos;re confirming your payment. This usually takes a few seconds.
        </p>
        <div
          aria-hidden
          className="mx-auto mt-5 size-6 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
        />
        <p className="mt-6 text-xs text-text-muted">
          Still here after a minute?{" "}
          <button
            type="button"
            onClick={() => {
              setWaitingForWebhook(false);
              refreshBilling();
            }}
            className="font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Refresh
          </button>{" "}
          to sync your plan.
        </p>
      </div>
    );
  }

  if (verifying) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 py-4 text-sm text-text-muted"
      >
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
        />
        Confirming your subscription…
      </div>
    );
  }

  // ---- Derived copy --------------------------------------------------------
  const pending = subscription.pendingPlanTier;
  const pendingIsUpgrade = pending != null && tierRank(pending) > tierRank(tier);
  const nextPlan = nextPlanAbove(tier);
  const accountsUsed = accountLimit.currentTotal;
  const accountsLimit = accountLimit.limitTotal;
  const unlimited = isUnlimitedAccounts(accountsLimit);
  const atAccountLimit = !unlimited && accountsLimit > 0 && accountsUsed >= accountsLimit;
  const freeUsed = freePosts ? Math.max(0, freePosts.limit - freePosts.remaining) : null;
  const freeOut = freePosts != null && freePosts.remaining <= 0;

  const showYearlyNudge =
    paid &&
    currentInterval === "monthly" &&
    !subscription.cancelAtPeriodEnd &&
    !subscription.paused &&
    pending == null &&
    !flows.upgradePending;
  const yearlyPrice = paid ? periodPrice(tier, "yearly", extraAccounts) : 0;
  const monthlyTimes12 = paid ? periodPrice(tier, "monthly", extraAccounts) * 12 : 0;
  const onAgency = tier === "agency";

  const statusLine = paid
    ? subscription.cancelAtPeriodEnd
      ? `Ends ${renewalDate ?? "at the end of this period"} · no further charges`
      : subscription.paused
        ? "Paused"
        : `${renewalDate ? `Renews ${renewalDate}` : "Renews at the end of this period"} · billed ${currentInterval}`
    : `${getPlanLimits("free").maxConnectedAccounts} accounts and ${getPlanLimits("free").maxFreePosts} posts to try everything`;

  const menuItems: BillingMenuItem[] = [
    {
      key: "portal",
      label: "Billing portal",
      hint: "Invoices, receipts and subscription details",
      icon: <FileText />,
      onSelect: () => void flows.openPortal(),
    },
  ];
  if (paid) {
    menuItems.push({
      key: "payment",
      label: "Update payment method",
      icon: <CreditCard />,
      onSelect: () => void flows.openPortal(),
    });
    if (!subscription.cancelAtPeriodEnd && !subscription.paused) {
      // Pausing isn't self-serve (the payment provider has no pause API), so
      // this routes to feedback instead of promising a pause that can't happen.
      menuItems.push({
        key: "pause",
        label: "Ask about pausing",
        hint: "Tell us what you need and we'll sort it out",
        icon: <PauseCircle />,
        onSelect: () => navigate("/dashboard/feedback"),
      });
    }
    if (subscription.cancelAtPeriodEnd) {
      menuItems.push({
        key: "undo-cancel",
        label: "Undo cancellation",
        icon: <RotateCcw />,
        onSelect: () => void flows.undoCancel(),
      });
    } else {
      menuItems.push({
        key: "cancel",
        label: "Cancel subscription",
        icon: <XCircle />,
        tone: "danger",
        onSelect: () => {
          posthog?.capture("plan_cancellation_started", { current_plan: tier });
          setCancelOpen(true);
        },
      });
    }
  }

  const menuBusy = flows.busy !== null;

  return (
    <div className="space-y-4">
      {/* ---- Notices: only things that need a decision ---- */}
      {subscription.cancelAtPeriodEnd && paid ? (
        <Banner
          tier="blocking"
          title="Your subscription is cancelled."
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void flows.undoCancel()}
              disabled={menuBusy}
            >
              {flows.busy === "undoCancel" ? "Undoing…" : "Undo cancellation"}
            </Button>
          }
        >
          You keep full access until {renewalDate ?? "the end of this billing period"}.
        </Banner>
      ) : null}

      {flows.upgradePending || flows.recoveryMessage ? (
        <Banner
          tier="blocking"
          actions={
            flows.recoveryAction === "cancel_pending" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void flows.cancelPendingChange()}
                disabled={menuBusy}
              >
                {flows.busy === "cancelPending" ? "Cancelling…" : "Cancel pending upgrade"}
              </Button>
            ) : flows.recoveryAction === "portal" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void flows.openPortal()}
                disabled={menuBusy}
              >
                {flows.busy === "portal" ? "Opening…" : "Update payment method"}
              </Button>
            ) : null
          }
        >
          {flows.recoveryMessage ??
            "Your upgrade payment is processing. You'll move to the new plan automatically once it succeeds."}
        </Banner>
      ) : null}

      {flows.stuckCheckout ? (
        <Banner
          tier="blocking"
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void flows.freshCheckout()}
              disabled={flows.loadingPlan !== null}
            >
              {flows.loadingPlan === flows.stuckCheckout.plan
                ? "Starting…"
                : "Start a fresh checkout"}
            </Button>
          }
        >
          Your last checkout looks stuck. Start a fresh checkout to create a new payment session.
        </Banner>
      ) : null}

      {pending && paid ? (
        <Banner
          tier="info"
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void flows.cancelPendingChange()}
              disabled={menuBusy}
            >
              {flows.busy === "cancelPending"
                ? "Cancelling…"
                : pendingIsUpgrade
                  ? "Cancel upgrade"
                  : "Cancel downgrade"}
            </Button>
          }
        >
          Your plan will {pendingIsUpgrade ? "upgrade" : "downgrade"} to {planName(pending)} on{" "}
          {renewalDate ?? "your renewal date"}.
        </Banner>
      ) : null}

      {subscription.paused && paid ? (
        <Banner tier="info" title="Your subscription is paused.">
          Scheduled posts won&apos;t publish until it resumes. Open the billing portal to resume
          early.
        </Banner>
      ) : null}

      {upgradeParam === "1" ? (
        <Banner
          tier="info"
          onDismiss={() => setPlansOpen(true)}
          dismissLabel="Dismiss upgrade note"
        >
          {PLAN_NAMES.creator} gives you 15 accounts, bulk tools, auto-plug and auto-repost.{" "}
          {PLAN_NAMES.agency} gives you {AGENCY_INCLUDED_ACCOUNTS} accounts (then +$
          {formatMoney(AGENCY_EXTRA_ACCOUNT_PRICE.monthly)}/month each)
          and teammates.
        </Banner>
      ) : null}

      {/* ---- Plan: a settings section (heading + hairline rows), no card ---- */}
      <section aria-labelledby="billing-plan-title" className="pt-2">
        <h2 id="billing-plan-title" className="pb-3 text-[15px] font-semibold text-text">
          Plan
        </h2>
        <div className="divide-y divide-border border-t border-border [&>*]:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight text-text">
                {planName(tier)}
                {paid ? (
                  <span className="font-normal text-text-muted">
                    {" "}
                    · {shortPrice(tier, currentInterval, extraAccounts)}
                  </span>
                ) : null}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[13px]",
                  subscription.cancelAtPeriodEnd ? "text-warning" : "text-text-muted",
                )}
              >
                {statusLine}
              </p>
              {legacy ? (
                <p className="mt-1.5 text-[13px] text-text-muted">
                  {legacyPlanSummary(legacy)}. You&apos;re on a plan we no longer sell. You keep
                  it and its price as long as you stay subscribed.
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {paid ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPlansOpen(!plansOpen, { highlight: null })}
                  aria-expanded={plansOpen}
                  aria-controls="plans"
                >
                  {plansOpen ? "Hide plans" : "Change plan"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() =>
                    setPlansOpen(true, { highlight: highlight ?? "creator" })
                  }
                >
                  Upgrade
                </Button>
              )}
              <BillingMenu items={menuItems} disabled={menuBusy} />
            </div>
          </div>

          {/* Usage */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              {onAgency ? (
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-text">Connected accounts</span>
                  <span className="tabular-nums text-text-muted">
                    {accountsUsed} · {AGENCY_INCLUDED_ACCOUNTS} included
                  </span>
                </div>
              ) : unlimited ? (
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-text">Connected accounts</span>
                  <span className="text-text-muted">{accountsUsed} · Unlimited</span>
                </div>
              ) : (
                <Meter
                  value={accountsUsed}
                  max={accountsLimit}
                  label="Connected accounts"
                  hint={`${accountsUsed} of ${accountsLimit}`}
                  size="md"
                />
              )}
              {atAccountLimit && nextPlan === "agency" && !onAgency ? (
                <p className="mt-2 text-xs text-text-muted">
                  You&apos;re at your limit. {planName("agency")} includes{" "}
                  {AGENCY_INCLUDED_ACCOUNTS} accounts, then +$
                  {formatMoney(AGENCY_EXTRA_ACCOUNT_PRICE.monthly)}/mo each, never a cap.{" "}
                  <button
                    type="button"
                    disabled={flows.loadingPlan !== null || flows.busy !== null}
                    onClick={() =>
                      void flows.startUpgrade(
                        "agency",
                        interval,
                        agencyExtraAccounts(accountsUsed),
                      )
                    }
                    className="font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
                  >
                    Move to {planName("agency")}
                  </button>
                </p>
              ) : atAccountLimit && nextPlan ? (
                <p className="mt-2 text-xs text-text-muted">
                  You&apos;re at your limit. {planName(nextPlan)} gives you{" "}
                  {isUnlimitedAccounts(getPlanLimits(nextPlan).maxConnectedAccounts)
                    ? "unlimited accounts"
                    : `${getPlanLimits(nextPlan).maxConnectedAccounts} accounts`}
                  .{" "}
                  <button
                    type="button"
                    onClick={() => setPlansOpen(true, { highlight: nextPlan })}
                    className="font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    See {planName(nextPlan)}
                  </button>
                </p>
              ) : null}
            </div>

            <div>
              {!paid && freePosts && freeUsed != null ? (
                <>
                  <Meter
                    value={freeUsed}
                    max={freePosts.limit}
                    label="Free posts"
                    hint={`${freeUsed} of ${freePosts.limit} used`}
                    size="md"
                  />
                  {freeOut ? (
                    <p className="mt-2 text-xs text-text-muted">
                      You&apos;ve used your free posts. Drafts still save.{" "}
                      <button
                        type="button"
                        onClick={() => setPlansOpen(true, { highlight: "creator" })}
                        className="font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        See {PLAN_NAMES.creator}
                      </button>
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-text">Posts</span>
                  <span className="text-text-muted">{paid ? "Unlimited" : `${getPlanLimits("free").maxFreePosts} on Free`}</span>
                </div>
              )}
            </div>
          </div>

          {onAgency ? (
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">Accounts</p>
              <p className="mt-0.5 text-[13px] text-text-muted">
                {AGENCY_INCLUDED_ACCOUNTS} included
                {extraAccounts > 0
                  ? `, ${extraAccounts} extra on your bill (+$${formatMoney(
                      extraAccounts * AGENCY_EXTRA_ACCOUNT_PRICE[currentInterval],
                    )}/${currentInterval === "yearly" ? "year" : "month"})`
                  : ""}
                . {AGENCY_EXTRA_ACCOUNT_NOTE} Disconnecting lowers your next bill; there are no
                mid-cycle refunds.
              </p>
            </div>
          ) : null}
          {showYearlyNudge && paid ? (
            <p className="text-[13px] text-text-muted">
              Pay ${formatMoney(yearlyPrice)} a year instead of ${formatMoney(monthlyTimes12)} (
              {Math.abs(monthlyTimes12 / 12 * 10 - yearlyPrice) < 0.005
                ? "2 months free"
                : `save $${formatMoney(Math.round((monthlyTimes12 - yearlyPrice) * 100) / 100)}`}
              ).{" "}
              <button
                type="button"
                disabled={flows.loadingPlan !== null}
                onClick={() => setSwitchTarget({ plan: tier, to: "yearly" })}
                className="font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
              >
                Switch to yearly
              </button>
            </p>
          ) : null}

          {paid ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">Invoices &amp; payment method</p>
                <p className="mt-0.5 text-[13px] text-text-muted">
                  Download invoices and change your card in the billing portal.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void flows.openPortal()}
                disabled={menuBusy}
              >
                {flows.busy === "portal" ? "Opening…" : "Open billing portal"}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {/* ---- Plans (behind Change plan) ---- */}
      {plansOpen ? (
        <PlansGrid
          tier={tier}
          extraAccounts={extraAccounts}
          connectedAccounts={accountsUsed}
          currentInterval={currentInterval}
          interval={interval}
          onIntervalChange={setGridInterval}
          highlight={highlight}
          pendingPlanTier={paid ? pending : null}
          renewalDate={renewalDate}
          loadingPlan={flows.loadingPlan}
          upgradePending={flows.upgradePending}
          onUpgrade={(plan, extras) =>
            void (paid
              ? flows.startUpgrade(plan, interval, extras)
              : flows.startCheckout(plan, interval, extras))
          }
          onDowngrade={(plan, extras) => setDowngradeTarget({ plan, extraAccounts: extras })}
          onSwitchInterval={(plan) => setSwitchTarget({ plan, to: interval })}
          onClose={() => setPlansOpen(false)}
        />
      ) : null}

      {/* ---- Dialogs ---- */}
      <UpgradeTimingDialog
        confirm={flows.upgradeConfirm}
        renewalDate={renewalDate}
        cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
        loading={flows.loadingPlan !== null}
        action={flows.upgradeAction}
        onConfirm={(when) => void flows.confirmUpgrade(when)}
        onClose={flows.closeUpgradeConfirm}
      />
      <DowngradeDialog
        target={downgradeTarget?.plan ?? null}
        targetExtraAccounts={downgradeTarget?.extraAccounts ?? 0}
        currentTier={tier}
        currentExtraAccounts={extraAccounts}
        interval={interval}
        renewalDate={renewalDate}
        cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
        loading={flows.loadingPlan !== null}
        onSchedule={(plan, reason) =>
          flows.scheduleDowngrade(plan, interval, reason, downgradeTarget?.extraAccounts ?? 0)
        }
        onClose={() => setDowngradeTarget(null)}
      />
      <SwitchIntervalDialog
        plan={switchTarget?.plan ?? null}
        extraAccounts={switchTarget?.plan === "agency" ? extraAccounts : 0}
        to={switchTarget?.to ?? "yearly"}
        loading={flows.loadingPlan !== null}
        renewalDate={renewalDate}
        cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
        onConfirm={async () => {
          if (!switchTarget) return;
          const ok = await flows.switchInterval(switchTarget.plan, switchTarget.to);
          if (ok) setSwitchTarget(null);
        }}
        onClose={() => setSwitchTarget(null)}
      />
      <CancelDialog
        open={cancelOpen}
        loading={flows.busy === "cancel"}
        renewalDate={renewalDate}
        onCancel={flows.cancel}
        onClose={() => setCancelOpen(false)}
      />
    </div>
  );
}

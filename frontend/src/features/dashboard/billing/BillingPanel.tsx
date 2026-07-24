import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { fetchApi } from "@/lib/fetch-api";

import { useState, useEffect } from "react";
import { usePostHog } from "@posthog/react";
import { IconLoader2, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import type { SubscriptionState } from "@/lib/subscription";
import type { AccountLimitResult } from "@/lib/plan-limits";
import { formatDate } from "@/lib/date-format";
import { assignSafeRedirectUrl } from "@/lib/safe-external-url";
import { Button } from "@/components/ui/button";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BillingInterval } from "@/lib/plans";
import {
  billedAsYearlyLabel,
  formatEffectiveMonthly,
  formatListMonthly,
  formatPlanPriceLabel,
  getPlanPrice,
  TAX_NOTE,
} from "@/lib/plan-pricing";
const POLL_INTERVAL_MS = 2000;
const PAYMENT_DECLINED_MESSAGE =
  "Your payment could not be processed. Please check your card details or try a different payment method.";

function toFriendlyBillingError(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (
    normalized.includes("generic_decline") ||
    normalized.includes("payment_declined") ||
    normalized.includes("declined")
  ) {
    return PAYMENT_DECLINED_MESSAGE;
  }
  return fallback;
}

/** Dodo preview summary: `currency`/`total_amount` = customer charge (may be INR); `settlement_*` = merchant settlement (often USD). */
type PreviewChargeSummary = {
  total_amount?: number;
  totalAmount?: number;
  currency?: string;
  settlement_amount?: number;
  settlementAmount?: number;
  settlement_currency?: string;
  settlementCurrency?: string;
};

function normalizePreviewSummary(raw: PreviewChargeSummary): {
  totalMinor: number;
  currency: string;
  settlementMinor?: number;
  settlementCurrency?: string;
} {
  const totalMinor =
    typeof raw.total_amount === "number"
      ? raw.total_amount
      : typeof raw.totalAmount === "number"
        ? raw.totalAmount
        : 0;
  const currency =
    typeof raw.currency === "string" && raw.currency.trim()
      ? raw.currency.trim()
      : "usd";
  const settlementMinor =
    typeof raw.settlement_amount === "number"
      ? raw.settlement_amount
      : typeof raw.settlementAmount === "number"
        ? raw.settlementAmount
        : undefined;
  const settlementCurrencyRaw =
    typeof raw.settlement_currency === "string"
      ? raw.settlement_currency
      : typeof raw.settlementCurrency === "string"
        ? raw.settlementCurrency
        : undefined;
  return {
    totalMinor,
    currency,
    settlementMinor,
    settlementCurrency: settlementCurrencyRaw?.trim() || undefined,
  };
}

/** Show USD when Dodo reports settlement in USD (local charge may still be INR). */
function formatPreviewAmount(raw: PreviewChargeSummary): string {
  const s = normalizePreviewSummary(raw);
  const c = (code: string) => code.toUpperCase();

  if (
    typeof s.settlementMinor === "number" &&
    s.settlementCurrency &&
    c(s.settlementCurrency) === "USD"
  ) {
    return `$${(s.settlementMinor / 100).toFixed(2)}`;
  }
  if (c(s.currency) === "USD") {
    return `$${(s.totalMinor / 100).toFixed(2)}`;
  }
  const cur = c(s.currency);
  const amount = (s.totalMinor / 100).toFixed(2);
  return cur === "USD" ? `$${amount}` : `${cur} ${amount}`;
}

const STARTER_BILLING_FEATURES = [
  "Connect up to 5 accounts",
  "Multiple accounts per platform",
  "Unlimited posts",
  "Schedule posts across platforms",
  "Carousel posts",
  "Threads & Collections support",
  "Human support",
];

const GROWTH_BILLING_FEATURES = [
  "Connect up to 15 accounts",
  "Multiple accounts per platform",
  "Unlimited posts",
  "Schedule posts across platforms",
  "Carousel posts",
  "Threads & Collections support",
  "Auto-plug high performing tweets",
  "Auto-repost on autopilot",
  "Bulk scheduling tools",
  "Human support",
];

const PRO_BILLING_FEATURES = [
  "Connect up to 50 accounts",
  "Team collaboration / invite teammates",
  "Multiple accounts per platform",
  "Unlimited posts",
  "Schedule posts across platforms",
  "Carousel posts",
  "Threads & Collections support",
  "Auto-plug high performing tweets",
  "Auto-repost on autopilot",
  "Bulk scheduling tools",
  "Priority support",
  "Early access to new features",
];

type PaidPlan = "starter" | "growth" | "pro";

const POLL_MAX_ATTEMPTS = 45; // ~1.5 min

type BillingPanelProps = {
  subscription: SubscriptionState;
  accountLimit: AccountLimitResult;
  justSubscribed?: boolean;
  dateFormat?: string | null;
  timezone?: string | null;
};

function redirectToComposer() {
  window.location.href = "/dashboard/composer";
}

export function BillingPanel({
  subscription,
  accountLimit,
  justSubscribed = false,
  dateFormat = "dd/MM/yyyy",
  timezone,
}: BillingPanelProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const invalidateQueries = useInvalidateQueries();
  const posthog = usePostHog();
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState<
    "portal" | "pause" | "cancel" | "undoCancel" | null
  >(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [cancelStep, setCancelStep] = useState<0 | 1 | 2>(0);
  const [cancelReason, setCancelReason] = useState("");
  const [downgradeStep, setDowngradeStep] = useState<0 | 1 | 2>(0);
  const [downgradeReason, setDowngradeReason] = useState("");
  const [targetDowngradePlan, setTargetDowngradePlan] = useState<
    "starter" | "growth" | null
  >(null);
  const [loadingChangePlan, setLoadingChangePlan] = useState<PaidPlan | null>(
    null,
  );
  const [upgradeConfirmOpen, setUpgradeConfirmOpen] = useState(false);
  const [upgradeConfirmPlan, setUpgradeConfirmPlan] = useState<PaidPlan | null>(
    null,
  );
  const [upgradePreview, setUpgradePreview] = useState<{
    immediateCharge: { summary: PreviewChargeSummary };
  } | null>(null);
  const [showRenewedTodayBanner] = useState(false);
  const [renewedOnDate] = useState<Date | null>(null);
  const [upgradePending, setUpgradePending] = useState(false);
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("yearly");
  const [waitingForWebhook, setWaitingForWebhook] = useState(
    Boolean(justSubscribed && subscription.tier === "free"),
  );
  // FREE TRIAL DISABLED — was: subscription.tier === "free" && !accountLimit.hasUsedTrial
  const showTrialInfo = false;

  // After return from checkout (?success=1): verify plan actually changed by polling sync; stop after 3 attempts and clear URL
  useEffect(() => {
    const success = searchParams.get("success");
    const status = searchParams.get("status");

    if (success === "1" && status === "failed") {
      navigate("/dashboard/billing", { replace: true });
      toast.error("Payment failed. Please try again.");
      return;
    }

    if (success !== "1") return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerifying(true);
    let attempts = 0;
    const maxAttempts = 3;

    const poll = async () => {
      attempts++;

      await fetchApi("/api/billing/sync", {
        method: "POST",
        credentials: "include",
      });
      invalidateQueries();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        setVerifying(false);
        navigate("/dashboard/billing", { replace: true });
      }
    };

    poll();
  }, [searchParams, navigate, invalidateQueries]);

  useEffect(() => {
    if (!waitingForWebhook) return;

    let attempts = 0;

    const trySyncAndCheck = async () => {
      try {
        // Sync from Dodo Payments by email (works even when webhook didn't reach localhost)
        const syncRes = await fetchApi("/api/billing/sync", {
          method: "POST",
          credentials: "include",
        });
        const syncData = await syncRes.json().catch(() => ({}));
        if (
          syncData?.ok === true &&
          (syncData.tier === "starter" ||
            syncData.tier === "growth" ||
            syncData.tier === "pro")
        ) {
          redirectToComposer();
          return true;
        }
        const checkRes = await fetchApi("/api/auth/subscription-check", {
          credentials: "include",
        });
        if (!checkRes.ok) return false;
        const checkData = await checkRes.json();
        if (checkData.hasSubscription === true) {
          redirectToComposer();
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };

    const run = async () => {
      attempts++;
      const done = await trySyncAndCheck();
      if (done) return;
      if (attempts >= POLL_MAX_ATTEMPTS) {
        setWaitingForWebhook(false);
      }
    };

    run();
    const id = setInterval(run, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [waitingForWebhook]);

  const tierLabel =
    subscription.tier === "pro"
      ? "Pro"
      : subscription.tier === "growth"
        ? "Growth"
        : subscription.tier === "starter"
          ? "Starter (Lite)"
          : "Free";

  const currentInterval: BillingInterval =
    subscription.interval === "yearly" || subscription.interval === "monthly"
      ? subscription.interval
      : "monthly";

  const priceLabel =
    subscription.tier === "starter" ||
    subscription.tier === "growth" ||
    subscription.tier === "pro"
      ? formatPlanPriceLabel(subscription.tier, currentInterval)
      : "$0/month";

  const starterPrice = getPlanPrice("starter", billingInterval);
  const growthPrice = getPlanPrice("growth", billingInterval);
  const proPrice = getPlanPrice("pro", billingInterval);

  const renewalDate =
    subscription.expiresAt && timezone
      ? formatDate(subscription.expiresAt, dateFormat, timezone)
      : subscription.expiresAt
        ? formatDate(subscription.expiresAt, dateFormat)
        : null;

  if (waitingForWebhook) {
    return (
      <div className="rounded-xl border border-border bg-bg-elevated p-8 shadow-sm text-center">
        <h2 className="text-lg font-semibold text-text">
          Setting up your subscription
        </h2>
        <p className="mt-2 text-text-muted">Processing your payment.</p>
        <p className="mt-2 text-sm text-text-muted">
          We&apos;re confirming your subscription - this usually takes a few
          seconds.
        </p>
        <p className="mt-6 text-xs text-text-muted">
          Still here after a minute?{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-medium text-accent hover:underline"
          >
            Refresh the page
          </button>{" "}
          to sync your plan.
        </p>
      </div>
    );
  }

  if (verifying) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <IconLoader2
          className="w-4 h-4 shrink-0 animate-spin"
          strokeWidth={1.5}
        />
        Confirming your subscription...
      </div>
    );
  }

  const handleChangePlan = async () => {
    setLoading("portal");
    try {
      const res = await fetchApi("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        if (!assignSafeRedirectUrl(data.url)) {
          toast.error("Could not open billing portal. Try again.");
        }
        return;
      }
      toast.error(
        toFriendlyBillingError(
          data.error,
          "Could not open billing portal. Try again.",
        ),
      );
    } finally {
      setLoading(null);
    }
  };

  const handlePause = async (months: 1 | 2 | 3) => {
    setLoading("pause");
    try {
      const res = await fetchApi("/api/billing/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ months }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPauseOpen(false);
        invalidateQueries();
        return;
      }
      if (data.error === "not_supported") {
        setPauseOpen(false);
        navigate("/dashboard/feedback");
        return;
      }
      toast.error(
        toFriendlyBillingError(data.error, "Failed to pause subscription."),
      );
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    setLoading("cancel");
    try {
      const res = await fetchApi("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setCancelStep(0);
        setCancelReason("");
        if (data.immediate) {
          toast.success(
            "Subscription cancelled. You've been moved to the free plan.",
          );
          invalidateQueries();
          navigate("/dashboard/billing", { replace: true });
        } else {
          toast.info(
            `You'll keep full access until ${renewalDate ?? "your period end"}. No further charges.`,
          );
          invalidateQueries();
        }
        return;
      }
      toast.error(
        toFriendlyBillingError(
          data.error,
          "Failed to cancel subscription. Please try again.",
        ),
      );
    } finally {
      setLoading(null);
    }
  };

  const handleUndoCancel = async () => {
    setLoading("undoCancel");
    try {
      const res = await fetchApi("/api/billing/undo-cancel", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success("Cancellation undone. Your subscription will continue.");
        invalidateQueries();
        return;
      }
      toast.error(
        toFriendlyBillingError(
          data.error,
          "Failed to undo cancellation. Please try again.",
        ),
      );
    } finally {
      setLoading(null);
    }
  };

  const handleScheduleDowngrade = async () => {
    if (!targetDowngradePlan) return;
    setLoadingChangePlan(targetDowngradePlan);
    try {
      const res = await fetchApi("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan: targetDowngradePlan,
          interval: billingInterval,
          scheduleAtPeriodEnd: true,
          reason: downgradeReason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDowngradeStep(0);
        setDowngradeReason("");
        setTargetDowngradePlan(null);
        toast.info(
          `Downgrade scheduled. You'll move to ${targetDowngradePlan === "starter" ? "Starter" : "Growth"} on ${renewalDate ?? "your renewal date"}.`,
        );
        invalidateQueries();
        return;
      }
      if (res.status === 404 && data.error === "no_active_subscription") {
        const ok = await redirectToCheckoutForPlan(targetDowngradePlan);
        if (ok) return;
      }
      toast.error(
        toFriendlyBillingError(
          data.error,
          "Failed to schedule downgrade. Please try again.",
        ),
      );
    } finally {
      setLoadingChangePlan(null);
    }
  };

  const handleCancelPendingPlanChange = async () => {
    const pendingLabel =
      subscription.pendingPlanTier === "pro"
        ? "Pro"
        : subscription.pendingPlanTier === "growth"
          ? "Growth"
          : "Starter";
    const isPendingUpgrade =
      subscription.pendingPlanTier != null &&
      ((subscription.tier === "starter" &&
        (subscription.pendingPlanTier === "growth" ||
          subscription.pendingPlanTier === "pro")) ||
        (subscription.tier === "growth" &&
          subscription.pendingPlanTier === "pro"));
    try {
      const res = await fetchApi("/api/billing/cancel-downgrade", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success(
          isPendingUpgrade
            ? `Scheduled upgrade to ${pendingLabel} cancelled.`
            : "Downgrade cancelled.",
        );
        invalidateQueries();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          toFriendlyBillingError(
            data.error,
            "Failed to cancel plan change. Please try again.",
          ),
        );
      }
    } catch {
      toast.error("Failed to cancel plan change. Please try again.");
    }
  };

  const handleUpgradePlan = async (plan: PaidPlan) => {
    posthog?.capture("plan_upgrade_started", {
      plan,
      current_plan: subscription.tier,
    });
    setLoadingChangePlan(plan);
    try {
      // Paid → higher paid: show preview so user picks Upgrade now vs on renewal.
      const needsPreview =
        (plan === "growth" && subscription.tier === "starter") ||
        (plan === "pro" &&
          (subscription.tier === "starter" || subscription.tier === "growth"));
      if (needsPreview) {
        const previewRes = await fetchApi("/api/billing/preview-plan-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ plan, interval: billingInterval }),
        });
        const previewData = await previewRes.json().catch(() => ({}));
        if (previewRes.ok && previewData.immediateCharge) {
          setUpgradePreview({
            immediateCharge: previewData.immediateCharge,
          });
          setUpgradeConfirmPlan(plan);
          setUpgradeConfirmOpen(true);
          setLoadingChangePlan(null);
          return;
        }
        // Preview failed - still open dialog without amount so user can schedule.
        setUpgradePreview(null);
        setUpgradeConfirmPlan(plan);
        setUpgradeConfirmOpen(true);
        setLoadingChangePlan(null);
        return;
      }

      await executeUpgrade(plan, false);
    } finally {
      setLoadingChangePlan(null);
    }
  };

  const executeUpgrade = async (
    plan: PaidPlan,
    scheduleAtPeriodEnd: boolean,
  ) => {
    const planLabel =
      plan === "pro" ? "Pro" : plan === "growth" ? "Growth" : "Starter";
    const res = await fetchApi("/api/billing/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        plan,
        interval: billingInterval,
        scheduleAtPeriodEnd,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success && data.scheduled) {
      toast.success(
        `Upgrade to ${planLabel} scheduled for ${renewalDate ?? "your renewal date"}. No charge today.`,
      );
      invalidateQueries();
      return true;
    }

    if (res.ok && data.success) {
      if (data.pending) {
        setUpgradePending(true);
        toast.info(
          `You'll be charged on your saved payment method. Once payment succeeds, you'll move to ${planLabel} automatically. Track status anytime via Manage Subscription.`,
        );
      } else {
        toast.success(`You're on ${planLabel}.`);
        invalidateQueries();
      }
      return true;
    }

    if (data.requireCheckout === true) {
      const ok = await redirectToCheckoutForPlan(plan);
      if (ok) return true;
    }
    if (res.status === 409) {
      if (data.code === "use_portal") {
        toast.info(
          typeof data.error === "string"
            ? data.error
            : "Update your payment method in the customer portal.",
        );
        await handleChangePlan();
        return true;
      }
      if (data.code === "use_change_plan") {
        toast.info(
          typeof data.error === "string"
            ? data.error
            : "You already have an active subscription.",
        );
        return true;
      }
      if (data.code === "pending_plan_change") {
        toast.info(
          typeof data.error === "string"
            ? data.error
            : "A previous plan change is still pending.",
        );
        return true;
      }
      setUpgradePending(true);
      toast.info(
        "Your upgrade payment is still being processed. You'll move to the new plan automatically once it succeeds. Track status anytime via Manage Subscription.",
      );
      return true;
    }
    if (res.status === 404 && data.error === "no_active_subscription") {
      const ok = await redirectToCheckoutForPlan(plan);
      if (ok) return true;
    }
    toast.error(
      toFriendlyBillingError(
        data.error,
        "Failed to change plan. Please try again.",
      ),
    );
    return false;
  };

  const handleConfirmUpgradeNow = async () => {
    if (!upgradeConfirmPlan) return;
    setLoadingChangePlan(upgradeConfirmPlan);
    try {
      const ok = await executeUpgrade(upgradeConfirmPlan, false);
      if (ok) {
        setUpgradeConfirmOpen(false);
        setUpgradeConfirmPlan(null);
        setUpgradePreview(null);
      }
    } finally {
      setLoadingChangePlan(null);
    }
  };

  const handleConfirmUpgradeOnRenewal = async () => {
    if (!upgradeConfirmPlan) return;
    setLoadingChangePlan(upgradeConfirmPlan);
    try {
      const ok = await executeUpgrade(upgradeConfirmPlan, true);
      if (ok) {
        setUpgradeConfirmOpen(false);
        setUpgradeConfirmPlan(null);
        setUpgradePreview(null);
      }
    } finally {
      setLoadingChangePlan(null);
    }
  };

  const redirectToCheckoutForPlan = async (plan: PaidPlan) => {
    const res = await fetchApi("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        plan,
        interval: billingInterval,
        successUrl: "/dashboard/billing?success=1",
      }),
    });
    const data = await res.json().catch(() => ({}));
    // Only follow URLs for a successful checkout (or an explicit portal handoff).
    // Never redirect on checkout_in_progress — that used to reopen another plan's session.
    if (res.ok && typeof data.url === "string") {
      if (!assignSafeRedirectUrl(data.url)) {
        toast.error("Failed to start checkout. Please try again.");
        return false;
      }
      return true;
    }
    if (res.status === 409 && data.code === "use_portal") {
      toast.info(
        typeof data.error === "string"
          ? data.error
          : "Opening the customer portal to update your payment method…",
      );
      if (typeof data.url === "string") {
        if (!assignSafeRedirectUrl(data.url)) {
          toast.error("Failed to open the customer portal. Please try again.");
          return false;
        }
        return true;
      }
      await handleChangePlan();
      return true;
    }
    if (res.status === 409 && data.code === "checkout_in_progress") {
      toast.info(
        typeof data.error === "string"
          ? data.error
          : "Checkout is already being prepared. Try again in a few seconds.",
      );
      return false;
    }
    if (res.status === 409 && data.code === "use_change_plan") {
      toast.info(
        typeof data.error === "string"
          ? data.error
          : "You already have a subscription on this account.",
      );
      return false;
    }
    return false;
  };

  const handleUpgradeFromFree = async (plan: PaidPlan) => {
    setLoadingChangePlan(plan);
    try {
      const ok = await redirectToCheckoutForPlan(plan);
      if (!ok) toast.error("Failed to start checkout. Please try again.");
    } finally {
      setLoadingChangePlan(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="border border-border rounded-xl p-6">
        <p className="text-sm text-muted-foreground">Current plan</p>
        <h2 className="text-2xl font-serif text-foreground">{tierLabel}</h2>
        {showRenewedTodayBanner && renewedOnDate && (
          <p className="text-sm text-accent mt-1">
            Your plan renewed on{" "}
            {renewedOnDate.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            .
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {subscription.cancelAtPeriodEnd
            ? renewalDate
              ? `Cancels on ${renewalDate}`
              : "Cancels at period end"
            : renewalDate
              ? `Renews ${renewalDate}`
              : "Renews -"}{" "}
          · {priceLabel}
        </p>

        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Connected accounts</p>
          <p className="text-2xl font-medium text-foreground">
            {accountLimit.currentTotal} / {accountLimit.limitTotal}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            onClick={handleChangePlan}
            disabled={loading !== null}
            className="min-w-44 justify-center"
          >
            Manage Subscription
          </Button>

          {subscription.tier !== "free" && !subscription.cancelAtPeriodEnd && (
            <Button
              variant="outline"
              onClick={() => {
                posthog?.capture("plan_cancellation_started", {
                  current_plan: subscription.tier,
                });
                setCancelStep(1);
              }}
              disabled={loading !== null}
              className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Cancel Subscription
            </Button>
          )}
          {subscription.tier !== "free" && subscription.cancelAtPeriodEnd && (
            <Button
              variant="outline"
              onClick={handleUndoCancel}
              disabled={loading !== null}
            >
              Undo Cancel
            </Button>
          )}
        </div>
      </div>

      {subscription.cancelAtPeriodEnd && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between flex-wrap gap-2">
          <span>
            Your subscription is cancelled. You have access until {renewalDate}.
          </span>
        </div>
      )}

      {upgradePending && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Upgrade payment is processing with your payment provider. You&apos;ll
          move to the new plan automatically once payment succeeds. Track whether
          it&apos;s done via Manage Subscription.
        </div>
      )}

      {subscription.pendingPlanTier && subscription.tier !== "free" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between flex-wrap gap-2">
          <span>
            {((subscription.tier === "starter" &&
              (subscription.pendingPlanTier === "growth" ||
                subscription.pendingPlanTier === "pro")) ||
            (subscription.tier === "growth" &&
              subscription.pendingPlanTier === "pro"))
              ? "Your plan will upgrade to "
              : "Your plan will downgrade to "}
            {subscription.pendingPlanTier === "pro"
              ? "Pro"
              : subscription.pendingPlanTier === "growth"
                ? "Growth"
                : "Starter"}{" "}
            on {renewalDate ?? "your renewal date"}.
          </span>
          <button
            type="button"
            onClick={handleCancelPendingPlanChange}
            className="text-xs underline hover:no-underline ml-4"
          >
            {((subscription.tier === "starter" &&
              (subscription.pendingPlanTier === "growth" ||
                subscription.pendingPlanTier === "pro")) ||
            (subscription.tier === "growth" &&
              subscription.pendingPlanTier === "pro"))
              ? "Cancel upgrade"
              : "Cancel downgrade"}
          </button>
        </div>
      )}

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Plans</h2>
          <BillingIntervalToggle
            value={billingInterval}
            onChange={setBillingInterval}
            size="sm"
          />
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Prices are tax-exclusive. Applicable GST (or other taxes) is added at
          checkout and shown on invoices from our payment processor.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Starter card */}
          <div
            className={`rounded-2xl border-2 p-6 flex flex-col ${
              subscription.tier === "starter"
                ? "ring-1 ring-accent border-accent/30 bg-accent/5"
                : "border-border bg-card"
            }`}
          >
            <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Starter
            </div>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="font-serif text-2xl font-bold text-foreground">
                $
                {billingInterval === "yearly"
                  ? formatEffectiveMonthly("starter")
                  : starterPrice.price}
              </span>
              <span className="text-xs text-muted-foreground">
                /month
                {` ${TAX_NOTE}`}
              </span>
            </div>
            {billingInterval === "yearly" ? (
              <p className="mb-2 text-xs text-muted-foreground">
                {billedAsYearlyLabel("starter")}
              </p>
            ) : null}
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              {STARTER_BILLING_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-accent shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {subscription.tier === "starter" ? (
                currentInterval !== billingInterval ? (
                  <Button
                    className="w-full"
                    disabled={loadingChangePlan !== null || upgradePending}
                    onClick={() => void executeUpgrade("starter", false)}
                  >
                    Switch to {billingInterval === "yearly" ? "yearly" : "monthly"}
                  </Button>
                ) : (
                  <Button disabled className="w-full" variant="outline">
                    Current plan
                  </Button>
                )
              ) : subscription.tier === "growth" ||
                subscription.tier === "pro" ? (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={loadingChangePlan !== null}
                  onClick={() => {
                    setTargetDowngradePlan("starter");
                    setDowngradeReason("");
                    setDowngradeStep(1);
                  }}
                >
                  Downgrade to Starter
                </Button>
              ) : (
                <>
                  <Button
                    className="w-full"
                    disabled={loadingChangePlan !== null}
                    onClick={() => handleUpgradeFromFree("starter")}
                  >
                    {showTrialInfo
                      ? "Start 3-day free trial"
                      : "Upgrade to Starter"}
                  </Button>
                  {showTrialInfo && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      3-day free trial included - you won&apos;t be charged
                      today.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Growth card */}
          <div
            className={`rounded-2xl border-2 p-6 flex flex-col relative ${
              subscription.tier === "growth"
                ? "ring-1 ring-accent border-accent/30 bg-accent/5"
                : "border-border bg-card"
            }`}
          >
            <span className="absolute top-4 right-4 rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
              Most popular
            </span>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Growth
            </div>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              {billingInterval === "yearly" &&
              formatListMonthly("growth") != null ? (
                <span className="text-sm text-muted-foreground line-through decoration-red-500 decoration-2">
                  ${formatListMonthly("growth")}
                </span>
              ) : billingInterval === "monthly" &&
                growthPrice.listPrice != null ? (
                <span className="text-sm text-muted-foreground line-through decoration-red-500 decoration-2">
                  ${growthPrice.listPrice}
                </span>
              ) : null}
              <span className="font-serif text-2xl font-bold text-foreground">
                $
                {billingInterval === "yearly"
                  ? formatEffectiveMonthly("growth")
                  : growthPrice.price}
              </span>
              <span className="text-xs text-muted-foreground">
                /month
                {` ${TAX_NOTE}`}
              </span>
              {billingInterval === "yearly" && growthPrice.savePercent != null ? (
                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                  Save {growthPrice.savePercent}%
                </span>
              ) : null}
            </div>
            {billingInterval === "yearly" ? (
              <p className="mb-2 text-xs text-muted-foreground">
                {billedAsYearlyLabel("growth")}
              </p>
            ) : null}
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              {GROWTH_BILLING_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-accent shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {subscription.tier === "growth" ? (
                currentInterval !== billingInterval ? (
                  <Button
                    className="w-full"
                    disabled={loadingChangePlan !== null || upgradePending}
                    onClick={() => void executeUpgrade("growth", false)}
                  >
                    Switch to {billingInterval === "yearly" ? "yearly" : "monthly"}
                  </Button>
                ) : (
                  <Button disabled className="w-full">
                    Current plan
                  </Button>
                )
              ) : subscription.tier === "pro" ? (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={loadingChangePlan !== null}
                  onClick={() => {
                    setTargetDowngradePlan("growth");
                    setDowngradeReason("");
                    setDowngradeStep(1);
                  }}
                >
                  Downgrade to Growth
                </Button>
              ) : subscription.tier === "starter" ? (
                <Button
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={loadingChangePlan !== null || upgradePending}
                  onClick={() => handleUpgradePlan("growth")}
                >
                  Upgrade to Growth
                </Button>
              ) : (
                <>
                  <Button
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                    disabled={loadingChangePlan !== null}
                    onClick={() => handleUpgradeFromFree("growth")}
                  >
                    {showTrialInfo
                      ? "Start 3-day free trial"
                      : "Upgrade to Growth"}
                  </Button>
                  {showTrialInfo && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      3-day free trial included - you won&apos;t be charged
                      today.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Pro card */}
          <div
            className={`rounded-2xl border-2 p-6 flex flex-col ${
              subscription.tier === "pro"
                ? "ring-1 ring-accent border-accent/30 bg-accent/5"
                : "border-border bg-card"
            }`}
          >
            <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Pro
            </div>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              {billingInterval === "yearly" &&
              formatListMonthly("pro") != null ? (
                <span className="text-sm text-muted-foreground line-through decoration-red-500 decoration-2">
                  ${formatListMonthly("pro")}
                </span>
              ) : billingInterval === "monthly" &&
                proPrice.listPrice != null ? (
                <span className="text-sm text-muted-foreground line-through decoration-red-500 decoration-2">
                  ${proPrice.listPrice}
                </span>
              ) : null}
              <span className="font-serif text-2xl font-bold text-foreground">
                $
                {billingInterval === "yearly"
                  ? formatEffectiveMonthly("pro")
                  : proPrice.price}
              </span>
              <span className="text-xs text-muted-foreground">
                /month
                {` ${TAX_NOTE}`}
              </span>
              {billingInterval === "yearly" && proPrice.savePercent != null ? (
                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                  Save {proPrice.savePercent}%
                </span>
              ) : null}
            </div>
            {billingInterval === "yearly" ? (
              <p className="mb-2 text-xs text-muted-foreground">
                {billedAsYearlyLabel("pro")}
              </p>
            ) : null}
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              {PRO_BILLING_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-accent shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {subscription.tier === "pro" ? (
                currentInterval !== billingInterval ? (
                  <Button
                    className="w-full"
                    disabled={loadingChangePlan !== null || upgradePending}
                    onClick={() => void executeUpgrade("pro", false)}
                  >
                    Switch to {billingInterval === "yearly" ? "yearly" : "monthly"}
                  </Button>
                ) : (
                  <Button disabled className="w-full">
                    Current plan
                  </Button>
                )
              ) : subscription.tier === "starter" ||
                subscription.tier === "growth" ? (
                <Button
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={loadingChangePlan !== null || upgradePending}
                  onClick={() => handleUpgradePlan("pro")}
                >
                  Upgrade to Pro
                </Button>
              ) : (
                <>
                  <Button
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                    disabled={loadingChangePlan !== null}
                    onClick={() => handleUpgradeFromFree("pro")}
                  >
                    {showTrialInfo
                      ? "Start 3-day free trial"
                      : "Upgrade to Pro"}
                  </Button>
                  {showTrialInfo && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      3-day free trial included - you won&apos;t be charged
                      today.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <Dialog
        open={upgradeConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setUpgradeConfirmOpen(false);
            setUpgradeConfirmPlan(null);
            setUpgradePreview(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Upgrade to{" "}
              {upgradeConfirmPlan === "pro"
                ? "Pro"
                : upgradeConfirmPlan === "starter"
                  ? "Starter"
                  : "Growth"}
            </DialogTitle>
            <DialogDescription>
              Choose when you want the upgrade to take effect.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleConfirmUpgradeNow}
              disabled={loadingChangePlan !== null || !upgradeConfirmPlan}
              className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent/5 disabled:opacity-50"
            >
              <p className="font-medium text-foreground">Upgrade now</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {upgradePreview?.immediateCharge?.summary
                  ? `Charge ${formatPreviewAmount(upgradePreview.immediateCharge.summary)} on your saved payment method`
                  : "Charge the prorated difference on your saved payment method"}
                . Access unlocks after payment succeeds — track it via Manage
                Subscription.
              </p>
              {subscription.cancelAtPeriodEnd && (
                <p className="mt-1 text-xs text-accent">
                  Your cancellation will be removed after upgrade.
                </p>
              )}
            </button>
            <button
              type="button"
              onClick={handleConfirmUpgradeOnRenewal}
              disabled={loadingChangePlan !== null || !upgradeConfirmPlan}
              className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent/5 disabled:opacity-50"
            >
              <p className="font-medium text-foreground">Upgrade on renewal</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No payment today · Starts on{" "}
                {renewalDate ?? "your renewal date"}
              </p>
            </button>
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => {
                setUpgradeConfirmOpen(false);
                setUpgradeConfirmPlan(null);
                setUpgradePreview(null);
              }}
              disabled={loadingChangePlan !== null}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={downgradeStep !== 0}
        onOpenChange={(open) => {
          if (open) return;
          setDowngradeStep(0);
          setDowngradeReason("");
          setTargetDowngradePlan(null);
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          {downgradeStep === 1 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  STEP 1 OF 2
                </p>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setDowngradeStep(0);
                    setDowngradeReason("");
                    setTargetDowngradePlan(null);
                  }}
                >
                  <IconX className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              <DialogHeader>
                <DialogTitle>Before you downgrade...</DialogTitle>
                <DialogDescription>
                  What made you decide to downgrade?
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <textarea
                  value={downgradeReason}
                  onChange={(e) => setDowngradeReason(e.target.value)}
                  placeholder="Please share your reason..."
                  className="min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <p className="text-xs text-muted-foreground whitespace-pre-line">
                  this helps me understand what&apos;s missing. i&apos;ll read
                  every response and use it to improve Social0.{"\n"}- abhishek
                  (the person who built + runs social0)
                </p>
              </div>

              <DialogFooter className="mt-4 gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDowngradeStep(0);
                    setDowngradeReason("");
                    setTargetDowngradePlan(null);
                  }}
                  disabled={loadingChangePlan !== null}
                >
                  Close
                </Button>
                <Button
                  onClick={() => setDowngradeStep(2)}
                  disabled={
                    loadingChangePlan !== null ||
                    downgradeReason.trim().length === 0
                  }
                >
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  STEP 2 OF 2
                </p>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setDowngradeStep(0);
                    setDowngradeReason("");
                    setTargetDowngradePlan(null);
                  }}
                >
                  <IconX className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              <div className="mt-2">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-900/50 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-foreground text-center">
                  Downgrade to{" "}
                  {targetDowngradePlan === "growth" ? "Growth" : "Starter"}?
                </h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  You&apos;ll stay on {tierLabel} until{" "}
                  {renewalDate ?? "your renewal date"}. After that, your plan
                  switches to{" "}
                  {targetDowngradePlan === "growth"
                    ? `Growth (${formatPlanPriceLabel("growth", billingInterval)})`
                    : `Starter (${formatPlanPriceLabel("starter", billingInterval)})`}
                  . You won&apos;t be charged now.
                </p>
                {subscription.cancelAtPeriodEnd && (
                  <p className="mt-2 text-sm text-amber-700 dark:text-amber-300 text-center">
                    Your cancellation will be replaced with a downgrade at the
                    end of your billing cycle.
                  </p>
                )}

                <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
                  <p className="text-sm font-medium mb-3">
                    You&apos;ll lose access to:
                  </p>
                  <ul className="space-y-2">
                    {(targetDowngradePlan === "growth"
                      ? [
                          "Up to 50 accounts (drops to 15)",
                          "Team collaboration / invite teammates",
                          "Priority support",
                        ]
                      : [
                          "Up to 15 accounts (drops to 5)",
                          "Auto-plug high performing tweets",
                          "Auto-repost on autopilot",
                          "Bulk scheduling tools",
                          ...(subscription.tier === "pro"
                            ? ["Team collaboration / invite teammates"]
                            : []),
                        ]
                    ).map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between mt-6">
                  <button
                    onClick={() => setDowngradeStep(1)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
                    type="button"
                    disabled={loadingChangePlan !== null}
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleScheduleDowngrade}
                    disabled={loadingChangePlan !== null}
                    className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-6 py-3 text-sm font-medium transition-colors disabled:opacity-50"
                    type="button"
                  >
                    Schedule Downgrade
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pause your subscription</DialogTitle>
            <DialogDescription>
              How long would you like to pause? You can resume anytime. Your
              data and connections will be preserved.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2">
            {[1, 2, 3].map((m) => (
              <Button
                key={m}
                variant="outline"
                onClick={() => handlePause(m as 1 | 2 | 3)}
                disabled={loading !== null}
              >
                {`Pause for ${m} month${m > 1 ? "s" : ""}`}
              </Button>
            ))}
          </div>

          <DialogFooter className="mt-2">
            <p className="text-xs text-muted-foreground">
              Your data and settings will be preserved during the pause
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelStep !== 0} onOpenChange={() => setCancelStep(0)}>
        <DialogContent className="sm:max-w-lg">
          {cancelStep === 1 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  STEP 1 OF 2
                </p>
              </div>
              <DialogHeader>
                <DialogTitle>Please tell us how we can do better</DialogTitle>
                <DialogDescription>
                  What made you cancel your subscription?
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Please share your reason..."
                  className="min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <p className="text-xs text-muted-foreground whitespace-pre-line">
                  the feedback you put here matters to me. i will pay attention
                  and improve Social0 based on it, thank you for your time.
                  {"\n"}- abhishek (the person who built + runs social0)
                </p>
              </div>

              <DialogFooter className="mt-4 gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setCancelStep(0)}
                  disabled={loading !== null}
                >
                  Close
                </Button>
                <Button
                  onClick={() => setCancelStep(2)}
                  disabled={
                    loading !== null || cancelReason.trim().length === 0
                  }
                >
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  STEP 2 OF 2
                </p>
              </div>

              <div className="mt-2">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-red-200 dark:bg-red-900/50 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-foreground text-center">
                  Confirm Cancellation
                </h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  Thank you for your feedback. Your subscription will be
                  cancelled at the end of your current billing period.
                  You&apos;ll continue to have access until then.
                </p>

                <div className="mt-5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 text-left">
                  <p className="text-sm font-medium text-foreground mb-3">
                    After your period ends, you&apos;ll lose access to:
                  </p>
                  <ul className="space-y-2">
                    {[
                      "Multi-platform posting (9 platforms)",
                      "Content scheduling",
                      "Bulk scheduling tools",
                      "Auto-repost & Auto-plug",
                      "Connected accounts get disconnected after 30 days",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between mt-6">
                  <button
                    onClick={() => setCancelStep(1)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
                    type="button"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={loading === "cancel"}
                    className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-6 py-3 text-sm font-medium transition-colors disabled:opacity-50"
                    type="button"
                  >
                    Confirm Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

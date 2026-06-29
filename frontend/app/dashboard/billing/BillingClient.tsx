"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { IconLoader2, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import type { SubscriptionState } from "@/lib/subscription";
import type { AccountLimitResult } from "@/lib/plan-limits";
import { formatDate } from "@/lib/date-format";
import { assignSafeRedirectUrl } from "@/lib/safe-external-url";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
const POLL_MAX_ATTEMPTS = 45; // ~1.5 min

type BillingClientProps = {
  subscription: SubscriptionState;
  accountLimit: AccountLimitResult;
  justSubscribed?: boolean;
  dateFormat?: string | null;
  timezone?: string | null;
};

function redirectToComposer() {
  window.location.href = "/dashboard/composer";
}

export function BillingClient({
  subscription,
  accountLimit,
  justSubscribed = false,
  dateFormat = "dd/MM/yyyy",
  timezone,
}: BillingClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
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
    "starter" | null
  >(null);
  const [loadingChangePlan, setLoadingChangePlan] = useState<
    "starter" | "growth" | null
  >(null);
  const [upgradeConfirmOpen, setUpgradeConfirmOpen] = useState(false);
  const [upgradeConfirmPlan, setUpgradeConfirmPlan] = useState<
    "starter" | "growth" | null
  >(null);
  const [upgradePreview, setUpgradePreview] = useState<{
    immediateCharge: { summary: PreviewChargeSummary };
  } | null>(null);
  const [showRenewedTodayBanner] = useState(false);
  const [renewedOnDate] = useState<Date | null>(null);
  const [upgradePending, setUpgradePending] = useState(false);
  const [waitingForWebhook, setWaitingForWebhook] = useState(
    Boolean(justSubscribed && subscription.tier === "free"),
  );
  const showTrialInfo =
    subscription.tier === "free" && !accountLimit.hasUsedTrial;

  // After return from checkout (?success=1): verify plan actually changed by polling sync; stop after 3 attempts and clear URL
  useEffect(() => {
    const success = searchParams.get("success");
    const status = searchParams.get("status");

    if (success === "1" && status === "failed") {
      router.replace("/dashboard/billing");
      toast.error("Payment failed. Please try again.");
      return;
    }

    if (success !== "1") return;

    setVerifying(true);
    let attempts = 0;
    const maxAttempts = 3;

    const poll = async () => {
      attempts++;

      await fetch("/api/billing/sync", {
        method: "POST",
        credentials: "include",
      });
      router.refresh();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        setVerifying(false);
        router.replace("/dashboard/billing");
      }
    };

    poll();
  }, [searchParams, router]);

  useEffect(() => {
    if (!waitingForWebhook) return;

    let attempts = 0;

    const trySyncAndCheck = async () => {
      try {
        // Sync from Dodo Payments by email (works even when webhook didn't reach localhost)
        const syncRes = await fetch("/api/billing/sync", {
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
        const checkRes = await fetch("/api/auth/subscription-check", {
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

  const pricePerMonth =
    subscription.tier === "starter"
      ? 6
      : subscription.tier === "growth"
        ? 19
        : subscription.tier === "pro"
          ? 35
          : 0;

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
      const res = await fetch("/api/billing/portal", {
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
      const res = await fetch("/api/billing/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ months }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPauseOpen(false);
        router.refresh();
        return;
      }
      if (data.error === "not_supported") {
        setPauseOpen(false);
        router.push("/dashboard/feedback");
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
      const res = await fetch("/api/billing/cancel", {
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
          router.refresh();
          router.replace("/dashboard/billing");
        } else {
          toast.info(
            `You'll keep full access until ${renewalDate ?? "your period end"}. No further charges.`,
          );
          router.refresh();
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
      const res = await fetch("/api/billing/undo-cancel", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success("Cancellation undone. Your subscription will continue.");
        router.refresh();
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
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan: targetDowngradePlan,
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
        router.refresh();
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

  const handleCancelDowngrade = async () => {
    try {
      const res = await fetch("/api/billing/cancel-downgrade", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Downgrade cancelled.");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          toFriendlyBillingError(
            data.error,
            "Failed to cancel downgrade. Please try again.",
          ),
        );
      }
    } catch {
      toast.error("Failed to cancel downgrade. Please try again.");
    }
  };

  const handleUpgradePlan = async (plan: "starter" | "growth") => {
    setLoadingChangePlan(plan);
    try {
      // For Starter → Growth, show preview first so user sees exact charge before confirming.
      if (plan === "growth" && subscription.tier === "starter") {
        const previewRes = await fetch("/api/billing/preview-plan-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ plan }),
        });
        const previewData = await previewRes.json().catch(() => ({}));
        if (previewRes.ok && previewData.immediateCharge) {
          setUpgradePreview({
            immediateCharge: previewData.immediateCharge,
          });
          setUpgradeConfirmPlan("growth");
          setUpgradeConfirmOpen(true);
          setLoadingChangePlan(null);
          return;
        }
        // Preview failed (e.g. no subscription) - fall back to direct change-plan.
      }

      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan, scheduleAtPeriodEnd: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.pending) {
        toast.info(
          "Payment processing - your plan will update automatically once payment clears.",
        );
        return;
      }
      if (data.requireCheckout === true) {
        const ok = await redirectToCheckoutForPlan(plan);
        if (ok) return;
      }
      if (res.status === 409) {
        if (data.code === "use_portal") {
          toast.info(
            typeof data.error === "string"
              ? data.error
              : "Update your payment method in the customer portal.",
          );
          await handleChangePlan();
          return;
        }
        if (data.code === "use_change_plan") {
          toast.info(
            typeof data.error === "string"
              ? data.error
              : "You already have an active subscription.",
          );
          return;
        }
        setUpgradePending(true);
        toast.info(
          "Your upgrade payment is still being processed. You'll be moved to Growth automatically - no action needed. If you didn't receive a payment request, try again after a few minutes.",
        );
        return;
      }
      if (res.status === 404 && data.error === "no_active_subscription") {
        const ok = await redirectToCheckoutForPlan(plan);
        if (ok) return;
      }
      toast.error(
        toFriendlyBillingError(
          data.error,
          "Failed to change plan. Please try again.",
        ),
      );
    } finally {
      setLoadingChangePlan(null);
    }
  };

  const handleConfirmUpgrade = async () => {
    if (!upgradeConfirmPlan || !upgradePreview) return;
    setLoadingChangePlan(upgradeConfirmPlan);
    try {
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan: upgradeConfirmPlan,
          scheduleAtPeriodEnd: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.pending) {
        setUpgradeConfirmOpen(false);
        setUpgradeConfirmPlan(null);
        setUpgradePreview(null);
        toast.info(
          "Payment processing - your plan will update automatically once payment clears.",
        );
        return;
      }
      if (data.requireCheckout === true) {
        const ok = await redirectToCheckoutForPlan(upgradeConfirmPlan);
        if (ok) return;
      }
      if (res.status === 409) {
        setUpgradeConfirmOpen(false);
        setUpgradeConfirmPlan(null);
        setUpgradePreview(null);
        setUpgradePending(true);
        toast.info(
          "Your upgrade payment is still being processed. You'll be moved to Growth automatically - no action needed. If you didn't receive a payment request, try again after a few minutes.",
        );
        return;
      }
      if (res.status === 404 && data.error === "no_active_subscription") {
        const ok = await redirectToCheckoutForPlan(upgradeConfirmPlan);
        if (ok) return;
      }
      toast.error(
        toFriendlyBillingError(
          data.error,
          "Failed to change plan. Please try again.",
        ),
      );
    } finally {
      setLoadingChangePlan(null);
    }
  };

  const redirectToCheckoutForPlan = async (plan: "starter" | "growth") => {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        plan,
        successUrl: "/dashboard/billing?success=1",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if ((res.ok || res.status === 409) && typeof data.url === "string") {
      if (res.status === 409 && data.code === "checkout_in_progress") {
        toast.info("Opening your existing checkout…");
      }
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
          : "Open the customer portal to fix your subscription.",
      );
      await handleChangePlan();
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

  const handleUpgradeFromFree = async (plan: "starter" | "growth") => {
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
          <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
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
          · {pricePerMonth > 0 ? `$${pricePerMonth}/month` : "$0/month"}
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
            {loading === "portal" ? (
              <span className="inline-flex items-center gap-2">
                <IconLoader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  strokeWidth={1.5}
                />
                Opening…
              </span>
            ) : (
              "Manage Subscription"
            )}
          </Button>

          {subscription.tier !== "free" && !subscription.cancelAtPeriodEnd && (
            <Button
              variant="outline"
              onClick={() => setCancelStep(1)}
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
              {loading === "undoCancel" ? (
                <>
                  <IconLoader2
                    className="h-4 w-4 animate-spin"
                    strokeWidth={1.5}
                  />
                  Undoing…
                </>
              ) : (
                "Undo Cancel"
              )}
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

      {subscription.pendingPlanTier && subscription.tier !== "free" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between flex-wrap gap-2">
          <span>
            Your plan will downgrade to{" "}
            {subscription.pendingPlanTier === "starter" ? "Starter" : "Growth"}{" "}
            on {renewalDate ?? "your renewal date"}.
          </span>
          <button
            type="button"
            onClick={handleCancelDowngrade}
            className="text-xs underline hover:no-underline ml-4"
          >
            Cancel downgrade
          </button>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Plans</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Starter card */}
          <div
            className={`rounded-2xl border-2 bg-card p-6 flex flex-col ${
              subscription.tier === "starter"
                ? "ring-1 ring-accent border-accent/30"
                : "border-border"
            }`}
          >
            <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Starter
            </div>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-serif text-2xl font-bold text-foreground">
                $9
              </span>
              <span className="text-xs text-muted-foreground">/month</span>
            </div>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              {STARTER_BILLING_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-emerald-500 shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {subscription.tier === "starter" ? (
                <Button disabled className="w-full" variant="outline">
                  Current plan
                </Button>
              ) : subscription.tier === "growth" ? (
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
                    {loadingChangePlan === "starter" ? (
                      <>
                        <IconLoader2
                          className="h-4 w-4 animate-spin"
                          strokeWidth={1.5}
                        />
                        Opening…
                      </>
                    ) : showTrialInfo ? (
                      "Start 3-day free trial"
                    ) : (
                      "Upgrade to Starter"
                    )}
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
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-serif text-2xl font-bold text-foreground">
                $19
              </span>
              <span className="text-sm text-muted-foreground line-through">
                $29
              </span>
              <span className="text-xs text-muted-foreground">/month</span>
            </div>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              {GROWTH_BILLING_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-emerald-500 shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {subscription.tier === "growth" ? (
                <Button disabled className="w-full">
                  Current plan
                </Button>
              ) : subscription.tier === "starter" ? (
                <Button
                  className="w-full bg-accent hover:bg-accent/90 text-white"
                  disabled={loadingChangePlan !== null || upgradePending}
                  onClick={() => handleUpgradePlan("growth")}
                >
                  {loadingChangePlan === "growth" && !upgradeConfirmOpen ? (
                    <>
                      <IconLoader2
                        className="h-4 w-4 animate-spin"
                        strokeWidth={1.5}
                      />
                      Getting price…
                    </>
                  ) : (
                    "Upgrade (starts new billing cycle)"
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    className="w-full bg-accent hover:bg-accent/90 text-white"
                    disabled={loadingChangePlan !== null}
                    onClick={() => handleUpgradeFromFree("growth")}
                  >
                    {loadingChangePlan === "growth" ? (
                      <>
                        <IconLoader2
                          className="h-4 w-4 animate-spin"
                          strokeWidth={1.5}
                        />
                        Opening…
                      </>
                    ) : showTrialInfo ? (
                      "Start 3-day free trial"
                    ) : (
                      "Upgrade to Growth"
                    )}
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
            <DialogTitle>Upgrade to Growth</DialogTitle>
            <DialogDescription>
              You&apos;ll be charged{" "}
              {upgradePreview?.immediateCharge?.summary
                ? formatPreviewAmount(upgradePreview.immediateCharge.summary)
                : "the amount below"}{" "}
              immediately. Your billing cycle will restart from today.
            </DialogDescription>
          </DialogHeader>
          {upgradePreview && upgradeConfirmPlan && (
            <div className="rounded-xl border border-border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Upgrading to</p>
                  <p className="font-medium">
                    {upgradeConfirmPlan === "growth" ? "Growth" : "Starter"}{" "}
                    plan
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    You&apos;ll be charged now
                  </p>
                  <p className="text-xl font-medium">
                    {formatPreviewAmount(
                      upgradePreview.immediateCharge.summary,
                    )}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Your billing cycle will restart from today.
              </p>
              {subscription.cancelAtPeriodEnd && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Your cancellation will be removed after upgrade.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
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
            <Button
              onClick={handleConfirmUpgrade}
              disabled={
                loadingChangePlan !== null ||
                !upgradePreview ||
                !upgradeConfirmPlan
              }
            >
              {loadingChangePlan === upgradeConfirmPlan ? (
                <>
                  <IconLoader2
                    className="h-4 w-4 animate-spin"
                    strokeWidth={1.5}
                  />
                  Upgrading…
                </>
              ) : (
                "Continue Upgrade"
              )}
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
                  Downgrade to Starter?
                </h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  You&apos;ll stay on Growth until{" "}
                  {renewalDate ?? "your renewal date"}. After that, your plan
                  switches to Starter ($9/month). You won&apos;t be charged now.
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
                    {[
                      "Up to 15 accounts (drops to 5)",
                      "Auto-plug high performing tweets",
                      "Auto-repost on autopilot",
                      "Bulk scheduling tools",
                    ].map((item) => (
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
                    className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-6 py-3 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    type="button"
                  >
                    {loadingChangePlan ? (
                      <>
                        <IconLoader2
                          className="w-4 h-4 animate-spin"
                          strokeWidth={1.5}
                        />
                        Scheduling...
                      </>
                    ) : (
                      "Schedule Downgrade"
                    )}
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
                {loading === "pause" ? (
                  <>
                    <IconLoader2
                      className="h-4 w-4 animate-spin"
                      strokeWidth={1.5}
                    />
                    Updating…
                  </>
                ) : (
                  `Pause for ${m} month${m > 1 ? "s" : ""}`
                )}
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
                    className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-6 py-3 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    type="button"
                  >
                    {loading === "cancel" ? (
                      <>
                        <IconLoader2
                          className="w-4 h-4 animate-spin"
                          strokeWidth={1.5}
                        />
                        Cancelling...
                      </>
                    ) : (
                      "Confirm Cancel"
                    )}
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

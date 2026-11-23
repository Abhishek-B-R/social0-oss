import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { databullAttribution } from "@/lib/databull";
import { fetchApi } from "@/lib/fetch-api";
import { assignSafeRedirectUrl } from "@/lib/safe-external-url";
import type { BillingInterval, PaidPlanTier } from "@/lib/plans";
import type { SubscriptionState } from "@/lib/subscription";
import { planName, tierRank } from "@/components/billing/plan-catalog";
import {
  PAYMENT_DECLINED_MESSAGE,
  readJson,
  str,
  toFriendlyBillingError,
  type PreviewChargeSummary,
} from "./billing-api";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * After an immediate plan change comes back `pending`, watch for the webhook
 * to land: check the latest subscription every second and re-read billing
 * every 10s for about a minute. `/api/billing/sync` allows 5 calls a minute;
 * a rate-limited sync still reloads billing from the DB, which the webhook
 * updates.
 */
const PENDING_CHECK_MS = 1_000;
const PENDING_REFRESH_EVERY_CHECKS = 10;
const PENDING_MAX_CHECKS = 65;

type PendingTarget = {
  plan: PaidPlanTier;
  interval: BillingInterval;
  fromTier: SubscriptionState["tier"];
  /** Set when the change is (or includes) an Agency extra-accounts quantity. */
  extraAccounts?: number;
};

/** Whether `sub` already reflects the change `target` is waiting on. */
function pendingChangeLanded(sub: SubscriptionState, target: PendingTarget): boolean {
  if (sub.tier !== target.plan) return false;
  if (target.extraAccounts != null && (sub.extraAccounts ?? 0) !== target.extraAccounts) {
    return false;
  }
  // Extra-accounts change on the same plan and interval: the quantity is the signal.
  if (
    target.extraAccounts != null &&
    target.plan === target.fromTier &&
    (sub.interval == null || sub.interval === target.interval)
  ) {
    return true;
  }
  // An interval-only switch needs the interval to flip; a tier change counts
  // once the tier moved, even when the interval isn't reported.
  if (sub.interval == null) return target.plan !== target.fromTier;
  return sub.interval === target.interval;
}

export type BusyAction =
  | "portal"
  | "cancel"
  | "undoCancel"
  | "cancelPending"
  | null;

export type UpgradeConfirm = {
  plan: PaidPlanTier;
  interval: BillingInterval;
  /** Agency only: paid accounts above the 59 included. */
  extraAccounts: number;
  preview: PreviewChargeSummary | null;
};

/** Agency extras go in the body only for Agency; other plans never send it. */
function extrasBody(plan: PaidPlanTier, extraAccounts: number | undefined) {
  return plan === "agency" ? { extraAccounts: Math.max(0, Math.floor(extraAccounts ?? 0)) } : {};
}

export type CheckoutResult = "redirected" | "handled" | "failed";

/**
 * Every billing mutation the page offers, ported 1:1 from the old
 * BillingPanel (same endpoints, same 409/402/404 handling, same copy where it
 * was already plain). The UI decides *when* to call these; this hook owns the
 * network calls and the recovery state they leave behind.
 */
export function useBillingFlows({
  subscription,
  renewalDate,
  refreshBilling,
}: {
  subscription: SubscriptionState;
  renewalDate: string | null;
  refreshBilling: () => void;
}) {
  const navigate = useNavigate();
  const posthog = usePostHog();

  const [busy, setBusy] = useState<BusyAction>(null);
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanTier | null>(null);
  const [upgradeConfirm, setUpgradeConfirm] = useState<UpgradeConfirm | null>(null);
  const [upgradeAction, setUpgradeAction] = useState<"now" | "renewal" | null>(null);
  const [upgradePending, setUpgradePending] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryAction, setRecoveryAction] = useState<"cancel_pending" | "portal" | null>(null);
  const [stuckCheckout, setStuckCheckout] = useState<{
    plan: PaidPlanTier;
    interval: BillingInterval;
    extraAccounts: number;
  } | null>(null);
  /** The plan/interval a `pending` change is waiting on (drives the poll). */
  const [pendingTarget, setPendingTarget] = useState<PendingTarget | null>(null);
  const subscriptionRef = useRef(subscription);
  useEffect(() => {
    subscriptionRef.current = subscription;
  }, [subscription]);

  const clearRecovery = () => {
    setUpgradePending(false);
    setRecoveryMessage(null);
    setRecoveryAction(null);
    setPendingTarget(null);
  };

  // A pending charge settles through the payment webhook, not this request:
  // keep re-reading billing (bounded) so the page moves on without a reload.
  // Past the window the banner stays up, and its copy tells the user to
  // cancel the pending change if it's stuck.
  useEffect(() => {
    if (!pendingTarget) return;
    let checks = 0;
    const id = window.setInterval(() => {
      checks++;
      if (pendingChangeLanded(subscriptionRef.current, pendingTarget)) {
        window.clearInterval(id);
        setPendingTarget(null);
        setUpgradePending(false);
        setRecoveryMessage(null);
        setRecoveryAction(null);
        toast.success(
          pendingTarget.plan !== pendingTarget.fromTier
            ? `You're on ${planName(pendingTarget.plan)}.`
            : pendingTarget.extraAccounts != null
              ? "Your account limit is updated."
              : `You're now billed ${pendingTarget.interval === "yearly" ? "yearly" : "monthly"}.`,
        );
        return;
      }
      if (checks >= PENDING_MAX_CHECKS) {
        window.clearInterval(id);
        return;
      }
      if (checks % PENDING_REFRESH_EVERY_CHECKS === 0) refreshBilling();
    }, PENDING_CHECK_MS);
    return () => window.clearInterval(id);
  }, [pendingTarget, refreshBilling]);

  const flagPending = (message: string) => {
    setUpgradePending(true);
    setRecoveryAction("cancel_pending");
    setRecoveryMessage(message);
  };

  // ---- Customer portal (manage, invoices, payment method) -----------------
  const openPortal = useCallback(async () => {
    setBusy("portal");
    try {
      const res = await fetchApi("/api/billing/portal", { method: "POST" });
      const data = await readJson(res);
      const url = str(data.url);
      if (res.ok && url) {
        if (!assignSafeRedirectUrl(url)) {
          toast.error("Couldn't open the billing portal. Try again.");
        }
        return;
      }
      toast.error(
        toFriendlyBillingError(data.error, "Couldn't open the billing portal. Try again."),
      );
    } catch {
      toast.error("Couldn't reach billing. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }, []);

  // ---- Checkout (Free → paid, or no active subscription) ------------------
  const redirectToCheckout = async (
    plan: PaidPlanTier,
    interval: BillingInterval,
    extraAccounts: number,
    options?: { forceNewSession?: boolean },
  ): Promise<CheckoutResult> => {
    const res = await fetchApi("/api/billing/checkout", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        plan,
        interval,
        ...extrasBody(plan, extraAccounts),
        successUrl: "/dashboard/billing?success=1",
        forceNewSession: options?.forceNewSession === true,
        ...databullAttribution(),
      }),
    });
    const data = await readJson(res);
    const url = str(data.url);
    const error = str(data.error);
    // Only follow URLs for a successful checkout (or an explicit portal
    // handoff). Never redirect on checkout_in_progress: that used to reopen
    // another plan's session.
    if (res.ok && url) {
      setStuckCheckout(null);
      if (!assignSafeRedirectUrl(url)) {
        toast.error("Couldn't start checkout. Try again.");
        return "failed";
      }
      return "redirected";
    }
    if (res.status === 409 && data.code === "use_portal") {
      toast.info(error ?? "Opening the billing portal to update your payment method…");
      if (url) {
        if (!assignSafeRedirectUrl(url)) {
          toast.error("Couldn't open the billing portal. Try again.");
          return "failed";
        }
        return "redirected";
      }
      await openPortal();
      return "handled";
    }
    if (res.status === 409 && data.code === "checkout_in_progress") {
      setStuckCheckout({ plan, interval, extraAccounts });
      toast.info(
        error
          ? `${error} If it stays stuck, start a fresh checkout.`
          : "Checkout is already being prepared. If it stays stuck, start a fresh checkout.",
      );
      return "handled";
    }
    if (res.status === 409 && data.code === "use_change_plan") {
      toast.info(error ?? "You already have a subscription on this account.");
      return "handled";
    }
    return "failed";
  };

  const startCheckout = async (
    plan: PaidPlanTier,
    interval: BillingInterval,
    extraAccounts = 0,
  ) => {
    posthog?.capture("plan_upgrade_started", { plan, current_plan: subscription.tier });
    setLoadingPlan(plan);
    try {
      const result = await redirectToCheckout(plan, interval, extraAccounts);
      if (result === "failed") toast.error("Couldn't start checkout. Try again.");
    } catch {
      toast.error("Couldn't reach billing. Check your connection and try again.");
    } finally {
      setLoadingPlan(null);
    }
  };

  const freshCheckout = async () => {
    if (!stuckCheckout) return;
    setLoadingPlan(stuckCheckout.plan);
    try {
      const result = await redirectToCheckout(
        stuckCheckout.plan,
        stuckCheckout.interval,
        stuckCheckout.extraAccounts,
        { forceNewSession: true },
      );
      if (result === "failed") toast.error("Couldn't start a fresh checkout. Try again.");
    } catch {
      toast.error("Couldn't reach billing. Check your connection and try again.");
    } finally {
      setLoadingPlan(null);
    }
  };

  // ---- Change plan (paid → paid, interval switch) --------------------------
  /** Returns true when the attempt was handled (success or a recovery state). */
  const executeChange = async (
    plan: PaidPlanTier,
    interval: BillingInterval,
    scheduleAtPeriodEnd: boolean,
    extraAccounts = 0,
  ): Promise<boolean> => {
    const label = planName(plan);
    const res = await fetchApi("/api/billing/change-plan", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        plan,
        interval,
        ...extrasBody(plan, extraAccounts),
        scheduleAtPeriodEnd,
      }),
    });
    const data = await readJson(res);
    const error = str(data.error);

    if (res.ok && data.success && data.scheduled) {
      clearRecovery();
      toast.success(
        `Upgrade to ${label} scheduled for ${renewalDate ?? "your renewal date"}. No charge today.`,
      );
      refreshBilling();
      return true;
    }

    if (res.ok && data.success) {
      if (data.pending) {
        const sameTier = plan === subscription.tier;
        setPendingTarget({
          plan,
          interval,
          fromTier: subscription.tier,
          ...(plan === "agency" ? { extraAccounts: Math.max(0, Math.floor(extraAccounts)) } : {}),
        });
        flagPending(
          sameTier
            ? "Your billing change is being processed. If this stays stuck for more than a few minutes, cancel the pending change and try again."
            : "Your upgrade charge is being processed. If this stays stuck for more than a few minutes, cancel the pending upgrade and try again.",
        );
        toast.info(
          sameTier
            ? `We're charging your saved payment method. Once it goes through you'll be billed ${interval}.`
            : `We're charging your saved payment method. Once it goes through you'll move to ${label} automatically.`,
        );
        // The request already cleared any pending cancellation or scheduled
        // change; show that now instead of after the charge settles.
        refreshBilling();
      } else {
        clearRecovery();
        toast.success(
          plan === subscription.tier
            ? `You're now billed ${interval === "yearly" ? "yearly" : "monthly"}.`
            : `You're on ${label}.`,
        );
        refreshBilling();
      }
      return true;
    }

    if (data.requireCheckout === true) {
      const result = await redirectToCheckout(plan, interval, extraAccounts);
      if (result !== "failed") return true;
    }
    if (res.status === 409) {
      if (data.code === "use_portal") {
        flagPending(
          error
            ? `${error} Cancel the pending upgrade, then try again.`
            : "Your subscription payment needs attention. Cancel the pending upgrade, then try again.",
        );
        toast.info(error ?? "Payment issue detected.");
        return true;
      }
      if (data.code === "use_change_plan") {
        toast.info(error ?? "You already have an active subscription.");
        return true;
      }
      if (data.code === "cancel_pending") {
        flagPending(
          error ??
            "Your subscription needs attention. Cancel the pending upgrade, then try again.",
        );
        toast.info(error ?? "Cancel the pending upgrade and try again.");
        return true;
      }
      if (data.code === "pending_plan_change") {
        flagPending(
          error ??
            "A previous plan change is still pending. Cancel it, then try the upgrade again.",
        );
        toast.info(error ?? "A previous plan change is still pending.");
        return true;
      }
      flagPending(
        "Your upgrade payment is still being processed. If it stays stuck, cancel the pending upgrade and try again.",
      );
      toast.info(
        "Your upgrade payment is still being processed. You'll move to the new plan automatically once it succeeds.",
      );
      return true;
    }
    if (res.status === 402 && data.requireCheckout !== true) {
      // Declined outright: nothing is left pending (the server already put
      // back any scheduled change it dropped), so keep the plan buttons usable
      // and point at the payment method instead of "cancel pending", which
      // would delete that restored change.
      clearRecovery();
      setRecoveryAction("portal");
      setRecoveryMessage(PAYMENT_DECLINED_MESSAGE);
      toast.error(error ?? PAYMENT_DECLINED_MESSAGE);
      return false;
    }
    if (res.status === 404 && data.error === "no_active_subscription") {
      const result = await redirectToCheckout(plan, interval, extraAccounts);
      if (result !== "failed") return true;
    }
    toast.error(toFriendlyBillingError(data.error, "Couldn't change your plan. Try again."));
    return false;
  };

  /**
   * Upgrade entry point used by plan cards and `?upgrade=<plan>`.
   * Free → checkout. Paid → higher paid: preview the charge and let the user
   * pick "now" vs "on renewal".
   */
  const startUpgrade = async (
    plan: PaidPlanTier,
    interval: BillingInterval,
    extraAccounts = 0,
  ) => {
    if (subscription.tier === "free") {
      await startCheckout(plan, interval, extraAccounts);
      return;
    }
    if (tierRank(plan) <= tierRank(subscription.tier)) return;
    posthog?.capture("plan_upgrade_started", { plan, current_plan: subscription.tier });
    setLoadingPlan(plan);
    try {
      const res = await fetchApi("/api/billing/preview-plan-change", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ plan, interval, ...extrasBody(plan, extraAccounts) }),
      });
      const data = await readJson(res);
      const immediate = data.immediateCharge as { summary?: PreviewChargeSummary } | undefined;
      // Preview failure still opens the dialog (without an amount) so the
      // user can schedule the upgrade for renewal.
      setUpgradeConfirm({
        plan,
        interval,
        extraAccounts,
        preview: res.ok && immediate?.summary ? immediate.summary : null,
      });
    } catch {
      setUpgradeConfirm({ plan, interval, extraAccounts, preview: null });
    } finally {
      setLoadingPlan(null);
    }
  };

  const confirmUpgrade = async (when: "now" | "renewal") => {
    if (!upgradeConfirm) return;
    setLoadingPlan(upgradeConfirm.plan);
    setUpgradeAction(when);
    try {
      const ok = await executeChange(
        upgradeConfirm.plan,
        upgradeConfirm.interval,
        when === "renewal",
        upgradeConfirm.extraAccounts,
      );
      if (ok) setUpgradeConfirm(null);
    } catch {
      toast.error("Couldn't reach billing. Check your connection and try again.");
    } finally {
      setLoadingPlan(null);
      setUpgradeAction(null);
    }
  };

  /** Same plan, other interval (monthly ↔ yearly). */
  const switchInterval = async (plan: PaidPlanTier, interval: BillingInterval) => {
    setLoadingPlan(plan);
    try {
      // Agency keeps its paid extras across an interval switch.
      return await executeChange(plan, interval, false, subscription.extraAccounts ?? 0);
    } catch {
      toast.error("Couldn't reach billing. Check your connection and try again.");
      return false;
    } finally {
      setLoadingPlan(null);
    }
  };

  const scheduleDowngrade = async (
    plan: PaidPlanTier,
    interval: BillingInterval,
    reason: string,
    extraAccounts = 0,
  ): Promise<boolean> => {
    setLoadingPlan(plan);
    try {
      const res = await fetchApi("/api/billing/change-plan", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          plan,
          interval,
          ...extrasBody(plan, extraAccounts),
          scheduleAtPeriodEnd: true,
          reason: reason.trim(),
        }),
      });
      const data = await readJson(res);
      if (res.ok && data.success) {
        toast.info(
          `Downgrade scheduled. You'll move to ${planName(plan)} on ${renewalDate ?? "your renewal date"}.`,
        );
        refreshBilling();
        return true;
      }
      if (res.status === 404 && data.error === "no_active_subscription") {
        const result = await redirectToCheckout(plan, interval, extraAccounts);
        if (result !== "failed") return true;
      }
      toast.error(
        toFriendlyBillingError(data.error, "Couldn't schedule the downgrade. Try again."),
      );
      return false;
    } catch {
      toast.error("Couldn't reach billing. Check your connection and try again.");
      return false;
    } finally {
      setLoadingPlan(null);
    }
  };

  const cancelPendingChange = async () => {
    const pending = subscription.pendingPlanTier;
    const isPendingUpgrade = pending != null && tierRank(pending) > tierRank(subscription.tier);
    const pendingLabel = pending ? planName(pending) : null;
    setBusy("cancelPending");
    try {
      const res = await fetchApi("/api/billing/cancel-downgrade", { method: "POST" });
      const data = await readJson(res);
      if (res.ok) {
        clearRecovery();
        toast.success(
          isPendingUpgrade
            ? `Pending upgrade${pendingLabel ? ` to ${pendingLabel}` : ""} cancelled. You can try again.`
            : data.cancelledRivals
              ? "Pending plan change cleared and duplicate subscriptions removed. You can try again."
              : "Pending plan change cancelled.",
        );
        refreshBilling();
      } else {
        toast.error(
          toFriendlyBillingError(data.error, "Couldn't cancel the plan change. Try again."),
        );
      }
    } catch {
      toast.error("Couldn't cancel the plan change. Try again.");
    } finally {
      setBusy(null);
    }
  };

  // ---- Cancel / undo ------------------------------------------------------
  const cancel = async (reason: string): Promise<boolean> => {
    setBusy("cancel");
    try {
      const res = await fetchApi("/api/billing/cancel", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ reason }),
      });
      const data = await readJson(res);
      if (res.ok && data.success) {
        if (data.immediate) {
          toast.success("Subscription cancelled. You're on the Free plan now.");
          refreshBilling();
          navigate("/dashboard/billing", { replace: true });
        } else {
          toast.info(
            `You'll keep full access until ${renewalDate ?? "the end of this billing period"}. No further charges.`,
          );
          refreshBilling();
        }
        return true;
      }
      toast.error(
        toFriendlyBillingError(data.error, "Couldn't cancel your subscription. Try again."),
      );
      return false;
    } catch {
      toast.error("Couldn't reach billing. Check your connection and try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const undoCancel = async () => {
    setBusy("undoCancel");
    try {
      const res = await fetchApi("/api/billing/undo-cancel", { method: "POST" });
      const data = await readJson(res);
      if (res.ok && data.success) {
        toast.success("Cancellation undone. Your subscription will continue.");
        refreshBilling();
        return;
      }
      toast.error(toFriendlyBillingError(data.error, "Couldn't undo the cancellation. Try again."));
    } catch {
      toast.error("Couldn't reach billing. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    loadingPlan,
    upgradePending,
    recoveryMessage,
    recoveryAction,
    stuckCheckout,
    upgradeConfirm,
    upgradeAction,
    closeUpgradeConfirm: () => {
      setUpgradeConfirm(null);
      setUpgradeAction(null);
    },
    openPortal,
    startCheckout,
    startUpgrade,
    confirmUpgrade,
    switchInterval,
    scheduleDowngrade,
    cancelPendingChange,
    freshCheckout,
    cancel,
    undoCancel,
  };
}

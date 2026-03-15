"use client";

import { useState, useEffect } from "react";
import type { SubscriptionState } from "@/lib/subscription";
import type {
  AccountLimitResult,
  TwitterTweetLimitResult,
} from "@/lib/plan-limits";
import { formatDate } from "@/lib/date-format";
import { Info } from "lucide-react";
import { DOCS_FAIR_USAGE_URL } from "@/lib/docs-url";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 45; // ~1.5 min

type BillingClientProps = {
  subscription: SubscriptionState;
  accountLimit: AccountLimitResult;
  twitterTweetLimit: TwitterTweetLimitResult;
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
  twitterTweetLimit,
  justSubscribed = false,
  dateFormat = "dd/MM/yyyy",
  timezone,
}: BillingClientProps) {
  const [loadingPlan, setLoadingPlan] = useState<
    "starter" | "growth" | "pro" | null
  >(null);
  const [loadingChangePlan, setLoadingChangePlan] = useState<
    "starter" | "growth" | "pro" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [waitingForWebhook, setWaitingForWebhook] = useState(
    Boolean(justSubscribed && subscription.tier === "free"),
  );

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

  async function handleUpgrade(plan: "starter" | "growth" | "pro") {
    setError(null);
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Failed to start checkout");
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handleChangePlan(plan: "starter" | "growth" | "pro") {
    setError(null);
    setLoadingChangePlan(plan);
    try {
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        window.location.reload();
        return;
      }
      if (data.error === "no_active_subscription" && data.plan) {
        handleUpgrade(data.plan);
        return;
      }
      setError(data.error ?? "Failed to change plan");
    } finally {
      setLoadingChangePlan(null);
    }
  }

  const tierLabel =
    subscription.tier === "pro"
      ? "Pro"
      : subscription.tier === "growth"
        ? "Growth"
        : subscription.tier === "starter"
          ? "Starter (Lite)"
          : "Free";

  if (waitingForWebhook) {
    return (
      <div className="rounded-xl border border-border bg-bg-elevated p-8 shadow-sm text-center">
        <h2 className="text-lg font-semibold text-text">
          Setting up your subscription
        </h2>
        <p className="mt-2 text-text-muted">
          Payment received. We’re activating your plan — this usually takes a
          few seconds.
        </p>
        <p className="mt-4 text-sm text-text-muted">
          You’ll be redirected to the dashboard shortly…
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

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-bg-elevated p-4 shadow-sm -mt-4">
        <h2 className="text-2xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          Current plan : {tierLabel}
        </h2>
        {subscription.expiresAt && (
          <p className="mt-0.5 text-sm text-text-muted">
            Renews{" "}
            {formatDate(new Date(subscription.expiresAt), dateFormat, timezone)}
          </p>
        )}
        {subscription.tier === "free" && (
          <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            {subscription.hasUsedTrial
              ? "Upgrade to a plan to connect accounts and start posting. Choose a plan below."
              : "Start your 7-day free trial to connect accounts and start posting. Choose a plan below to get started."}
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-bg-muted/50 dark:bg-bg-muted/30 p-4">
            <p className="text-sm font-medium text-text-muted">
              Connected accounts
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-text">
              {subscription.tier === "pro"
                ? `${accountLimit.currentTotal} / Unlimited`
                : accountLimit.limitTotal === 0
                  ? accountLimit.hasUsedTrial
                    ? "0 — Upgrade to connect"
                    : "0 — Start trial to connect"
                  : `${accountLimit.currentTotal} / ${accountLimit.limitTotal}`}
            </p>
          </div>
          {twitterTweetLimit.limit > 0 && (
            <div className="rounded-lg bg-bg-muted/50 dark:bg-bg-muted/30 p-4">
              <p className="text-sm font-medium text-text-muted">
                Twitter tweets this month
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-text">
                {twitterTweetLimit.used} / {twitterTweetLimit.limit}
              </p>
            </div>
          )}
        </div>
        {subscription.tier !== "free" && (
          <div className="mt-3">
            <a
              href="/api/billing/portal"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
            >
              Manage subscription
            </a>
            <p className="mt-1.5 text-xs text-text-muted">
              Upgrade, downgrade, cancel, or update payment method. Upgrades are
              prorated.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
        <h2 className="text-2xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          Plans
        </h2>
        <p className="mt-0.5 text-sm text-text-muted">
          Early adopter pricing. Lock in before price increases.
        </p>
        {/* Pro tier commented out for now — add back later */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border-2 border-border bg-bg p-4">
            <h3 className="text-xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
              Starter (Lite) —{" "}
              <span className="line-through text-muted-foreground text-base">$9</span>{" "}
              <span className="text-foreground text-2xl font-bold">$6</span>/month
            </h3>
            <p className="mt-0.5 text-sm text-text-muted">
              Up to 5 accounts, 300 tweets/month
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-text-muted">
              {[
                "Connect up to 5 accounts",
                "Multiple accounts per platform",
                "Unlimited posts",
                "Schedule posts across platforms",
                "Carousel posts",
                "Threads & Collections support",
                "300 tweets/month (Twitter/X)",
                "Fair usage policy",
                "Human support",
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-accent shrink-0">✓</span>
                  {f === "Fair usage policy" ? (
                    <a
                      href={DOCS_FAIR_USAGE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-text-muted hover:text-text transition-colors"
                      aria-label="Fair usage policy (opens docs)"
                    >
                      Fair usage policy
                      <Info className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : (
                    f
                  )}
                </li>
              ))}
            </ul>
            {subscription.tier === "starter" ? (
              <button
                type="button"
                disabled
                className="mt-4 w-full rounded-lg border-2 border-accent bg-transparent px-4 py-1.5 text-sm font-medium text-accent opacity-50 cursor-default"
              >
                Current plan
              </button>
            ) : subscription.tier === "growth" ||
              subscription.tier === "pro" ? (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Downgrading takes effect immediately. You'll be credited the difference. Continue?",
                    )
                  ) {
                    handleChangePlan("starter");
                  }
                }}
                disabled={loadingChangePlan !== null}
                className="mt-4 w-full rounded-lg border border-border bg-transparent px-4 py-1.5 text-sm font-medium text-text-muted hover:bg-bg-muted disabled:opacity-50 transition-colors"
              >
                {loadingChangePlan === "starter"
                  ? "Changing…"
                  : "Downgrade to Starter"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade("starter")}
                disabled={loadingPlan !== null}
                className="mt-4 w-full rounded-lg border-2 border-accent bg-transparent px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                {loadingPlan === "starter"
                  ? "Redirecting…"
                  : "Upgrade to Starter"}
              </button>
            )}
          </div>
          <div className="rounded-xl border-2 border-accent bg-accent/5 p-4">
            <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
              Most popular
            </span>
            <h3 className="text-xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
              Growth —{" "}
              <span className="line-through text-muted-foreground text-base">$29</span>{" "}
              <span className="text-foreground text-2xl font-bold">$19</span>/month
            </h3>
            <p className="mt-0.5 text-sm text-text-muted">
              Up to 15 accounts, 1,500 tweets/month
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-text-muted">
              {[
                "Up to 15 connected accounts",
                "Multiple accounts per platform",
                "Unlimited posts",
                "Schedule posts across platforms",
                "Carousel posts",
                "Threads & Collections support",
                "1,500 tweets/month (Twitter/X)",
                "Auto-plug high performing tweets",
                "Auto-repost on autopilot",
                "Bulk scheduling tools",
                "Fair usage policy",
                "Human support",
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-accent shrink-0">✓</span>
                  {f === "Fair usage policy" ? (
                    <a
                      href={DOCS_FAIR_USAGE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-text-muted hover:text-text transition-colors"
                      aria-label="Fair usage policy (opens docs)"
                    >
                      Fair usage policy
                      <Info className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : (
                    f
                  )}
                </li>
              ))}
            </ul>
            {subscription.tier === "growth" ? (
              <button
                type="button"
                disabled
                className="mt-4 w-full rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white opacity-50 cursor-default"
              >
                Current plan
              </button>
            ) : subscription.tier === "starter" ? (
              <button
                type="button"
                onClick={() => handleChangePlan("growth")}
                disabled={loadingChangePlan !== null}
                className="mt-4 w-full rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {loadingChangePlan === "growth"
                  ? "Upgrading…"
                  : "Upgrade to Growth"}
              </button>
            ) : subscription.tier === "pro" ? (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Downgrading takes effect immediately. You'll be credited the difference. Continue?",
                    )
                  ) {
                    handleChangePlan("growth");
                  }
                }}
                disabled={loadingChangePlan !== null}
                className="mt-4 w-full rounded-lg border border-border bg-transparent px-4 py-1.5 text-sm font-medium text-text-muted hover:bg-bg-muted disabled:opacity-50 transition-colors"
              >
                {loadingChangePlan === "growth"
                  ? "Changing…"
                  : "Downgrade to Growth"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade("growth")}
                disabled={loadingPlan !== null}
                className="mt-4 w-full rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {loadingPlan === "growth"
                  ? "Redirecting…"
                  : "Upgrade to Growth"}
              </button>
            )}
          </div>
          {/* Pro tier commented out for now — add back later
          <div className="rounded-xl border-2 border-border bg-bg p-4">
            <h3 className="font-semibold text-text">
              Pro —{" "}
              <span className="line-through text-muted-foreground">$49</span>{" "}
              <span className="text-foreground">$35</span>/month
            </h3>
            <p className="mt-0.5 text-sm text-text-muted">
              Unlimited accounts, 1,500 tweets/month
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-text-muted">
              {[
                "Unlimited connected accounts",
                "Everything in Growth",
                "Priority support",
                "Early access to new features",
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-accent shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {subscription.tier === "pro" ? (
              <button
                type="button"
                disabled
                className="mt-4 w-full rounded-lg border-2 border-accent bg-transparent px-4 py-1.5 text-sm font-medium text-accent opacity-50 cursor-default"
              >
                Current plan
              </button>
            ) : subscription.tier === "starter" || subscription.tier === "growth" ? (
              <button
                type="button"
                onClick={() => handleChangePlan("pro")}
                disabled={loadingChangePlan !== null}
                className="mt-4 w-full rounded-lg border-2 border-accent bg-transparent px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50 transition-colors"
              >
                {loadingChangePlan === "pro"
                  ? "Upgrading…"
                  : "Upgrade to Pro"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade("pro")}
                disabled={loadingPlan !== null}
                className="mt-4 w-full rounded-lg border-2 border-accent bg-transparent px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                {loadingPlan === "pro"
                  ? "Redirecting…"
                  : "Upgrade to Pro"}
              </button>
            )}
          </div>
          */}
        </div>
      </div>
    </div>
  );
}

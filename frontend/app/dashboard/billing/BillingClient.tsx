"use client";

import { useState, useEffect } from "react";
import type { SubscriptionState } from "@/lib/subscription";
import type { AccountLimitResult, TwitterTweetLimitResult } from "@/lib/plan-limits";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30; // ~1 min

type BillingClientProps = {
  subscription: SubscriptionState;
  accountLimit: AccountLimitResult;
  twitterTweetLimit: TwitterTweetLimitResult;
  justSubscribed?: boolean;
};

export function BillingClient({
  subscription,
  accountLimit,
  twitterTweetLimit,
  justSubscribed = false,
}: BillingClientProps) {
  const [loadingPlan, setLoadingPlan] = useState<"starter" | "growth" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitingForWebhook, setWaitingForWebhook] = useState(
    Boolean(justSubscribed && subscription.tier === "free"),
  );

  useEffect(() => {
    if (!waitingForWebhook) return;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch("/api/auth/subscription-check", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.hasSubscription === true) {
          setWaitingForWebhook(false);
          window.location.href = "/dashboard/composer";
          return;
        }
      } catch {
        // ignore
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        setWaitingForWebhook(false);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [waitingForWebhook]);

  async function handleUpgrade(plan: "starter" | "growth") {
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

  const tierLabel =
    subscription.tier === "growth"
      ? "Growth"
      : subscription.tier === "starter"
        ? "Starter (Lite)"
        : "Free";

  if (waitingForWebhook) {
    return (
      <div className="rounded-xl border border-border bg-bg-elevated p-8 shadow-sm text-center">
        <h2 className="text-lg font-semibold text-text">Setting up your subscription</h2>
        <p className="mt-2 text-text-muted">
          Payment received. We’re activating your plan — this usually takes a few seconds.
        </p>
        <p className="mt-4 text-sm text-text-muted">You’ll be redirected to the dashboard shortly…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Current plan</h2>
        <p className="mt-1 text-2xl font-bold text-text">{tierLabel}</p>
        {subscription.expiresAt && (
          <p className="mt-1 text-sm text-text-muted">
            Renews {subscription.expiresAt.toLocaleDateString()}
          </p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="text-sm font-medium text-text-muted">Connected accounts</p>
            <p className="text-xl font-semibold text-text">
              {accountLimit.currentTotal} / {accountLimit.limitTotal}
            </p>
          </div>
          {twitterTweetLimit.limit > 0 && (
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-sm font-medium text-text-muted">Twitter tweets this month</p>
              <p className="text-xl font-semibold text-text">
                {twitterTweetLimit.used} / {twitterTweetLimit.limit}
              </p>
            </div>
          )}
        </div>
        {subscription.tier !== "free" && (
          <div className="mt-4">
            <a
              href="/api/billing/portal"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-4 py-2 text-sm font-medium text-text hover:bg-bg-elevated transition-colors"
            >
              Manage subscription
            </a>
            <p className="mt-2 text-xs text-text-muted">
              Upgrade, downgrade, cancel, or update payment method. Upgrades are prorated.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Plans</h2>
        <p className="mt-1 text-sm text-text-muted">
          Upgrade or change your plan. All features and limits are listed below.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border-2 border-border bg-bg p-5">
            <h3 className="font-semibold text-text">Starter (Lite) — $6/month</h3>
            <p className="mt-1 text-sm text-text-muted">Up to 5 accounts, 300 tweets/month</p>
            <ul className="mt-4 space-y-2 text-sm text-text-muted">
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
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => handleUpgrade("starter")}
              disabled={subscription.tier === "starter" || subscription.tier === "growth" || loadingPlan !== null}
              className="mt-5 w-full rounded-lg border-2 border-accent bg-transparent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {loadingPlan === "starter" ? "Redirecting…" : subscription.tier === "starter" || subscription.tier === "growth" ? "Current plan" : "Upgrade to Starter"}
            </button>
          </div>
          <div className="rounded-xl border-2 border-accent bg-accent/5 p-5">
            <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
              Most popular
            </span>
            <h3 className="mt-2 font-semibold text-text">Growth — $20/month</h3>
            <p className="mt-1 text-sm text-text-muted">Up to 15 accounts, 1,500 tweets/month</p>
            <ul className="mt-4 space-y-2 text-sm text-text-muted">
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
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => handleUpgrade("growth")}
              disabled={subscription.tier === "growth" || loadingPlan !== null}
              className="mt-5 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {loadingPlan === "growth" ? "Redirecting…" : subscription.tier === "growth" ? "Current plan" : "Upgrade to Growth"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

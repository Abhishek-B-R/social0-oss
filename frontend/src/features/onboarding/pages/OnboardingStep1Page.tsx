import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchApi } from "@/lib/fetch-api";

import { useState, useEffect, Suspense } from "react";
import { usePostHog } from "@posthog/react";
import Link from "@/components/AppLink";
import { IconLoader2 } from "@tabler/icons-react";
import { getPlanLimits, type BillingInterval } from "@/lib/plans";
import {
  billedAsYearlyLabel,
  formatEffectiveMonthly,
  formatListMonthly,
  getPlanPrice,
  TAX_NOTE,
} from "@/lib/plan-pricing";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import { setOnboardingCompleted } from "@/api/onboarding";
import { DOCS_ONBOARDING_URL } from "@/lib/docs-url";
import { toast } from "sonner";
import { assignSafeRedirectUrl } from "@/lib/safe-external-url";

const PAYMENT_FAILED_MESSAGE =
  "Payment failed. Please check your payment method and try again.";
const PAYMENT_DECLINED_MESSAGE =
  "Your payment could not be processed. Please check your card details or try a different payment method.";

function toFriendlyCheckoutError(raw: unknown, fallback: string): string {
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

const FREE_FEATURES = [
  {
    title: "3 accounts",
    description: "Connect LinkedIn, Instagram, TikTok, X, and more.",
  },
  {
    title: `${getPlanLimits("free").maxFreePosts} free posts`,
    description: "Try scheduling and publishing before you upgrade.",
  },
  {
    title: "All post types",
    description: "Text, image, video, threads, and collections.",
  },
];

type PaidPlanId = "starter" | "growth" | "pro";

const PAID_PLANS: Array<{
  id: PaidPlanId;
  name: string;
  tagline: string;
  badge?: string;
  features: string[];
  emphasized?: boolean;
}> = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For creators getting started",
    features: [
      "Up to 5 connected accounts",
      "Unlimited posts",
      "Schedule across platforms",
      "Threads & Collections",
      "Human support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Early adopter pricing",
    badge: "Popular",
    emphasized: true,
    features: [
      "Everything in Starter",
      "Up to 15 connected accounts",
      "Auto-plug & auto-repost",
      "Bulk scheduling tools",
      "Human support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For teams & agencies",
    badge: "Teams",
    features: [
      "Everything in Growth",
      "Up to 50 connected accounts",
      "Invite teammates & collaborate",
      "Priority support",
      "Early access to new features",
    ],
  },
];

function OnboardingWelcomeContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanId | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("yearly");

  useEffect(() => {
    if (searchParams.get("payment_failed") === "1") {
      toast.error(PAYMENT_FAILED_MESSAGE);
      navigate("/onboarding/step2", { replace: true });
    }
  }, [searchParams, navigate]);

  async function handleExploreDashboard() {
    setSkipping(true);
    posthog?.capture("onboarding_skipped");
    try {
      await setOnboardingCompleted();
      navigate("/dashboard");
    } finally {
      setSkipping(false);
    }
  }

  async function handleSelectPlan(plan: PaidPlanId) {
    if (loadingPlan !== null) return;
    toast.dismiss();
    posthog?.capture("checkout_started", { plan, interval });
    setLoadingPlan(plan);
    try {
      const res = await fetchApi("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan,
          interval,
          successUrl: "/onboarding/step3?paid=1",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if ((res.ok || res.status === 409) && typeof data.url === "string") {
        if (res.status === 409 && data.code === "checkout_in_progress") {
          toast.info("Opening your existing checkout…");
        } else if (res.status === 409 && data.code === "use_portal") {
          toast.info(
            typeof data.error === "string"
              ? data.error
              : "Opening the customer portal to update your payment method…",
          );
        }
        if (!assignSafeRedirectUrl(data.url)) {
          toast.error("Failed to start checkout");
          return;
        }
        return;
      }
      if (res.status === 409 && data.code === "use_portal") {
        toast.info(
          typeof data.error === "string"
            ? data.error
            : "You have an unpaid subscription. We'll open billing to fix it.",
        );
        const portalRes = await fetchApi("/api/billing/portal", {
          method: "POST",
          credentials: "include",
        });
        const portalData = await portalRes.json().catch(() => ({}));
        if (portalRes.ok && portalData.url) {
          if (!assignSafeRedirectUrl(portalData.url)) {
            toast.error("Could not open billing portal");
          }
          return;
        }
      }
      if (res.status === 409 && data.code === "use_change_plan") {
        toast.info(
          typeof data.error === "string"
            ? data.error
            : "You already have a subscription. Go to billing to change your plan.",
        );
        navigate("/dashboard/billing", { replace: true });
        return;
      }
      toast.error(
        toFriendlyCheckoutError(data.error, "Failed to start checkout"),
      );
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="relative flex w-full flex-1 flex-col gap-10 lg:gap-12">
      {/* Top — welcome + free tier */}
      <section className="w-full">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="mb-3 text-sm font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Free to start
            </p>
            <h1 className="max-w-3xl font-serif text-3xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Welcome to Social0
            </h1>
            <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Schedule and publish to all your socials from one place. No credit
              card needed to try it.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <Link
              href="/onboarding/step3"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              Connect your first account →
            </Link>
            <button
              type="button"
              onClick={handleExploreDashboard}
              disabled={skipping}
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              {skipping ? (
                <>
                  <IconLoader2
                    className="mr-2 h-4 w-4 animate-spin"
                    strokeWidth={1.5}
                  />
                  Opening…
                </>
              ) : (
                "Explore dashboard"
              )}
            </button>
            <a
              href={DOCS_ONBOARDING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-muted hover:text-text"
              title="Documentation for this page"
              aria-label="Documentation for this page"
            >
              <svg
                className="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {FREE_FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <p className="font-semibold text-foreground">{f.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom — full-width horizontal pricing */}
      <section className="w-full">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Need more? Upgrade anytime
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {/* FREE TRIAL DISABLED — was: 3-day free trial · cancel anytime · lock in early-adopter pricing */}
              Cancel anytime · lock in early-adopter pricing
            </p>
          </div>
          <BillingIntervalToggle
            value={interval}
            onChange={setInterval}
            size="sm"
          />
        </div>

        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3 md:gap-5">
          {PAID_PLANS.map((plan) => {
            const pricing = getPlanPrice(plan.id, interval);
            return (
            <div
              key={plan.id}
              className={`relative flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm sm:p-6 ${
                plan.emphasized
                  ? "border-2 border-emerald-500 bg-emerald-500/5"
                  : "border-border"
              }`}
            >
              {plan.badge ? (
                <span
                  className={`absolute top-4 right-4 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    plan.emphasized
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {plan.badge}
                </span>
              ) : null}

              <h3 className="pr-16 text-lg font-semibold text-foreground">
                {plan.name}
              </h3>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {interval === "yearly"
                  ? formatListMonthly(plan.id) != null && (
                      <span className="text-sm text-muted-foreground line-through decoration-red-500 decoration-2">
                        ${formatListMonthly(plan.id)}
                      </span>
                    )
                  : pricing.listPrice != null && (
                      <span className="text-sm text-muted-foreground line-through decoration-red-500 decoration-2">
                        ${pricing.listPrice}
                      </span>
                    )}
                <span className="font-serif text-3xl font-semibold tracking-tight text-foreground">
                  $
                  {interval === "yearly"
                    ? formatEffectiveMonthly(plan.id)
                    : pricing.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  /mo{interval === "monthly" ? ` ${TAX_NOTE}` : ""}
                </span>
                {interval === "yearly" && pricing.savePercent != null ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                    Save {pricing.savePercent}%
                  </span>
                ) : null}
              </div>
              {interval === "yearly" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {billedAsYearlyLabel(plan.id)}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>

              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="shrink-0 text-emerald-500">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleSelectPlan(plan.id)}
                disabled={loadingPlan !== null}
                className={`mt-6 w-full rounded-xl px-4 py-3 text-sm transition-colors disabled:opacity-50 ${
                  plan.emphasized
                    ? "bg-emerald-500 font-semibold text-white hover:bg-emerald-600"
                    : "border-2 border-emerald-500 font-medium text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                }`}
              >
                {loadingPlan === plan.id
                  ? "Redirecting…"
                  : /* FREE TRIAL DISABLED — was: "Start free trial" */ "Subscribe"}
              </button>
            </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function OnboardingPlanPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingWelcomeContent />
    </Suspense>
  );
}

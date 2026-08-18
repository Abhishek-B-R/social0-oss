import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchApi } from "@/lib/fetch-api";
import { useState, useEffect, useRef, Suspense } from "react";
import { usePostHog } from "@posthog/react";
import Link from "@/components/AppLink";
import { CircleNotch } from "@/icons/phosphor";
import { getPlanLimits, type BillingInterval } from "@/lib/plans";
import { formatEffectiveMonthly, getPlanPrice } from "@/lib/plan-pricing";
import {
  fullPlanFeatureTexts,
  ONBOARDING_PLAN_HIGHLIGHTS,
} from "@/lib/plan-features";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import { PlanDiscountPrice } from "@/components/billing/PlanDiscountPrice";
import { setOnboardingCompleted } from "@/api/onboarding";
import { DOCS_ONBOARDING_URL } from "@/lib/docs-url";
import { toast } from "sonner";
import { assignSafeRedirectUrl } from "@/lib/safe-external-url";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import confetti from "canvas-confetti";
import {
  ONBOARDING_CHECKOUT_SUCCESS,
  ONBOARDING_PATHS,
} from "@/features/onboarding/lib/paths";
import {
  OnboardingDocsLink,
  OnboardingStepFrame,
  OnboardingStepHeader,
  onboardingGhostLinkClass,
  onboardingPrimaryCtaClass,
  onboardingSecondaryCtaClass,
} from "@/features/onboarding/components/onboarding-ui";
import { cn } from "@/lib/utils";

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
    description: "LinkedIn, Instagram, TikTok, X, and more.",
  },
  {
    title: `${getPlanLimits("free").maxFreePosts} free posts`,
    description: "Schedule and publish before you upgrade.",
  },
  {
    title: "All post types",
    description: "Text, image, video, threads, collections.",
  },
];

type PaidPlanId = "starter" | "growth" | "pro";

const PAID_PLANS: Array<{
  id: PaidPlanId;
  name: string;
  tagline: string;
  badge?: string;
  emphasized?: boolean;
}> = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For creators getting started",
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Most popular for growing brands",
    badge: "Popular",
    emphasized: true,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For teams & agencies",
    badge: "Teams",
  },
];

function OnboardingPlanContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const invalidateQueries = useInvalidateQueries();
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanId | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [expandedPlans, setExpandedPlans] = useState<
    Partial<Record<PaidPlanId, boolean>>
  >({});
  const [verifying, setVerifying] = useState(searchParams.get("paid") === "1");
  const [stuckCheckoutPlan, setStuckCheckoutPlan] = useState<PaidPlanId | null>(
    null,
  );
  const syncAttempted = useRef(false);
  const paid = searchParams.get("paid") === "1";

  useEffect(() => {
    if (searchParams.get("payment_failed") === "1") {
      toast.error(PAYMENT_FAILED_MESSAGE);
      navigate(ONBOARDING_PATHS.plan, { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!paid || syncAttempted.current) return;
    syncAttempted.current = true;
    setVerifying(true);
    fetchApi("/api/billing/sync", { method: "POST", credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const hasPaidTier =
          data?.ok === true && data?.tier && data.tier !== "free";
        if (hasPaidTier) {
          invalidateQueries();
          const duration = 2_000;
          const end = Date.now() + duration;
          const frame = () => {
            confetti({
              particleCount: 2,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
              colors: ["#10b981", "#34d399", "#6ee7b7"],
            });
            confetti({
              particleCount: 2,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
              colors: ["#10b981", "#34d399", "#6ee7b7"],
            });
            if (Date.now() < end) requestAnimationFrame(frame);
          };
          frame();
          setVerifying(false);
          navigate(ONBOARDING_PATHS.ready, { replace: true });
        } else {
          setVerifying(false);
          navigate(`${ONBOARDING_PATHS.plan}?payment_failed=1`, {
            replace: true,
          });
        }
      })
      .catch(() => {
        setVerifying(false);
        navigate(`${ONBOARDING_PATHS.plan}?payment_failed=1`, {
          replace: true,
        });
      });
  }, [paid, navigate, invalidateQueries]);

  async function handleStayFree() {
    setSkipping(true);
    try {
      navigate(ONBOARDING_PATHS.ready);
    } finally {
      setSkipping(false);
    }
  }

  async function handleExploreDashboard() {
    setSkipping(true);
    posthog?.capture("onboarding_skipped", { at: "plan" });
    try {
      await setOnboardingCompleted();
      navigate("/dashboard");
    } finally {
      setSkipping(false);
    }
  }

  async function handleSelectPlan(
    plan: PaidPlanId,
    options?: { forceNewSession?: boolean },
  ) {
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
          successUrl: ONBOARDING_CHECKOUT_SUCCESS,
          forceNewSession: options?.forceNewSession === true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.url === "string") {
        setStuckCheckoutPlan(null);
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
        if (typeof data.url === "string") {
          if (!assignSafeRedirectUrl(data.url)) {
            toast.error("Could not open billing portal");
          }
          return;
        }
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
      if (res.status === 409 && data.code === "checkout_in_progress") {
        setStuckCheckoutPlan(plan);
        toast.info(
          typeof data.error === "string"
            ? `${data.error} If it stays stuck, start a fresh checkout below.`
            : "Checkout is already being prepared. If it stays stuck, start a fresh checkout below.",
        );
        return;
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

  async function handleFreshCheckout() {
    if (!stuckCheckoutPlan) return;
    await handleSelectPlan(stuckCheckoutPlan, { forceNewSession: true });
  }

  if (verifying) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <CircleNotch className="h-8 w-8 shrink-0 animate-spin text-emerald-500" />
        <p className="text-sm text-muted-foreground">
          Confirming your subscription…
        </p>
      </div>
    );
  }

  return (
    <OnboardingStepFrame className="gap-10 lg:gap-12">
      <section className="relative w-full">
        <OnboardingDocsLink href={DOCS_ONBOARDING_URL} />

        <OnboardingStepHeader
          align="left"
          eyebrow="Free to start"
          title={
            <>
              Stay free or{" "}
              <em className="not-italic text-emerald-600 dark:text-emerald-400">
                unlock more
              </em>
            </>
          }
          description={
            <>
              No credit card required for Free. Upgrade anytime for more
              accounts, unlimited posts,{" "}
              <span className="whitespace-nowrap">and automations.</span>
            </>
          }
        />

        {stuckCheckoutPlan && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Your last checkout looks stuck. Start a fresh checkout to create
              a new payment session and try again.
            </p>
            <button
              type="button"
              onClick={() => void handleFreshCheckout()}
              disabled={loadingPlan !== null}
              className={cn(
                onboardingSecondaryCtaClass,
                "w-full border-amber-500/40 bg-white/80 text-amber-900 hover:bg-white dark:bg-transparent dark:text-amber-100 sm:w-auto",
              )}
            >
              {loadingPlan === stuckCheckoutPlan ? (
                <>
                  <CircleNotch className="h-4 w-4 animate-spin" />
                  Starting fresh…
                </>
              ) : (
                "Start a fresh checkout"
              )}
            </button>
          </div>
        )}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            {FREE_FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border/70 bg-card/70 px-4 py-3.5 backdrop-blur-sm"
              >
                <p className="font-semibold text-foreground">{f.title}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => void handleStayFree()}
            disabled={skipping}
            className={cn(onboardingPrimaryCtaClass, "w-full sm:w-auto")}
          >
            Continue on Free
            <span aria-hidden>→</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExploreDashboard()}
            disabled={skipping}
            className={cn(onboardingSecondaryCtaClass, "w-full sm:w-auto")}
          >
            {skipping ? (
              <>
                <CircleNotch className="h-4 w-4 animate-spin" />
                Opening…
              </>
            ) : (
              "Skip to dashboard"
            )}
          </button>
        </div>
      </section>

      <section className="w-full">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-sans text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Need more accounts or automation?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cancel anytime · early-adopter pricing locked in
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
            const expanded = expandedPlans[plan.id] === true;
            const features = expanded
              ? fullPlanFeatureTexts(plan.id)
              : [...ONBOARDING_PLAN_HIGHLIGHTS[plan.id]];
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex h-full flex-col rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur-sm sm:p-6",
                  plan.emphasized
                    ? "border-2 border-emerald-500 bg-emerald-500/[0.06]"
                    : "border-border/70",
                )}
              >
                {plan.badge ? (
                  <span
                    className={cn(
                      "absolute top-4 right-4 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      plan.emphasized
                        ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {plan.badge}
                  </span>
                ) : null}

                <h3 className="pr-16 text-lg font-semibold text-foreground">
                  {plan.name}
                </h3>
                <div className="mt-2">
                  <PlanDiscountPrice
                    amount={pricing.price}
                    listAmount={pricing.listPrice}
                    period={interval === "yearly" ? "/year" : "/month"}
                    size="md"
                    badge={
                      pricing.savePercent != null ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                          Save {pricing.savePercent}%
                        </span>
                      ) : null
                    }
                  />
                </div>
                {interval === "yearly" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    ≈ ${formatEffectiveMonthly(plan.id)}/month
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  {plan.tagline}
                </p>

                <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="shrink-0 text-emerald-500">✓</span>
                      {f}
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPlans((prev) => ({
                          ...prev,
                          [plan.id]: !expanded,
                        }))
                      }
                      className="mt-1 text-left text-sm font-medium text-emerald-600 underline-offset-2 transition-colors hover:text-emerald-500 hover:underline dark:text-emerald-400"
                    >
                      {expanded ? "Show less" : "and many more"}
                    </button>
                  </li>
                </ul>

                <button
                  type="button"
                  onClick={() => void handleSelectPlan(plan.id)}
                  disabled={loadingPlan !== null}
                  className={cn(
                    "mt-6 w-full rounded-full px-4 py-3 text-sm transition-[transform,background-color] disabled:opacity-50",
                    plan.emphasized
                      ? "bg-emerald-500 font-semibold text-[#04140c] hover:bg-emerald-400"
                      : "border border-emerald-500/60 font-medium text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400",
                  )}
                >
                  {loadingPlan === plan.id ? "Redirecting…" : "Subscribe"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Or{" "}
          <Link href="/pricing#compare" className={onboardingGhostLinkClass}>
            compare all plans
          </Link>
        </p>
      </section>
    </OnboardingStepFrame>
  );
}

/** Step 3 — soft upgrade (after connect). Free path is primary. */
export default function OnboardingPlanPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPlanContent />
    </Suspense>
  );
}

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import { PlanDiscountPrice } from "@/components/billing/PlanDiscountPrice";
import { databullAttribution } from "@/lib/databull";
import { fetchApi } from "@/lib/fetch-api";
import {
  AGENCY_INCLUDED_ACCOUNTS,
  getPlanLimits,
  PLAN_NAMES,
  type BillingInterval,
  type SellablePlanTier,
} from "@/lib/plans";
import {
  AGENCY_EXTRA_ACCOUNT_NOTE,
  formatMoney,
  planPriceForAccounts,
} from "@/lib/plan-pricing";
import {
  fullPlanFeatureTexts,
  ONBOARDING_PLAN_HIGHLIGHTS,
} from "@/lib/plan-features";
import { assignSafeRedirectUrl } from "@/lib/safe-external-url";
import { cn } from "@/lib/utils";
import { checkoutReturnPath } from "@/features/onboarding/lib/paths";
import { useFinishOnboarding } from "./use-finish-onboarding";
import { onboardingGhostLinkClass } from "./onboarding-styles";

const PAYMENT_DECLINED_MESSAGE =
  "Your payment couldn't be processed. Check your card details or try a different payment method.";

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

type PaidPlanId = SellablePlanTier;

/** Only the plans sold today. Names come from `PLAN_NAMES`. */
const PAID_PLANS: Array<{
  id: PaidPlanId;
  tagline: string;
  badge?: string;
  emphasized?: boolean;
}> = [
  {
    id: "creator",
    tagline: "For creators and small brands",
    badge: "Popular",
    emphasized: true,
  },
  { id: "agency", tagline: "For agencies and teams", badge: "Teams" },
];

/** Yearly price as a per-month figure, rounded up to the cent. */
function perMonth(yearly: number): string {
  return formatMoney(Math.ceil((yearly * 100) / 12) / 100);
}

/** Quiet "See plans" link. Plans are optional during onboarding. */
export function SeePlansLink({
  onOpen,
  children = "See plans",
  className,
}: {
  onOpen: () => void;
  children?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "rounded-sm font-medium text-foreground underline underline-offset-4 decoration-border transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Plans during onboarding: Free stays the default, paid plans are one click
 * away. Every checkout path from the old plan step is kept: fresh session for
 * a stuck checkout, billing portal for unpaid subscriptions, and billing for
 * an existing subscription.
 */
export function PlansDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pathname } = useLocation();
  const posthog = usePostHog();
  const { finish } = useFinishOnboarding();
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanId | null>(null);
  const [expandedPlans, setExpandedPlans] = useState<
    Partial<Record<PaidPlanId, boolean>>
  >({});
  const [stuckCheckoutPlan, setStuckCheckoutPlan] = useState<PaidPlanId | null>(
    null,
  );
  const freePosts = getPlanLimits("free").maxFreePosts;
  const freeAccounts = getPlanLimits("free").maxConnectedAccounts;

  async function openPortal(): Promise<boolean> {
    const portalRes = await fetchApi("/api/billing/portal", {
      method: "POST",
      credentials: "include",
    });
    const portalData = (await portalRes.json().catch(() => ({}))) as {
      url?: unknown;
    };
    if (portalRes.ok && typeof portalData.url === "string") {
      if (!assignSafeRedirectUrl(portalData.url)) {
        toast.error("Couldn't open billing. Try again from Settings → Billing.");
      }
      return true;
    }
    return false;
  }

  async function handleSelectPlan(
    plan: PaidPlanId,
    options?: { forceNewSession?: boolean },
  ) {
    if (loadingPlan !== null) return;
    toast.dismiss();
    posthog?.capture("checkout_started", {
      plan,
      interval,
      from: "onboarding",
    });
    setLoadingPlan(plan);
    try {
      const res = await fetchApi("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan,
          interval,
          successUrl: checkoutReturnPath(pathname),
          forceNewSession: options?.forceNewSession === true,
          ...databullAttribution(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: unknown;
        code?: unknown;
        error?: unknown;
      };
      if (res.ok && typeof data.url === "string") {
        setStuckCheckoutPlan(null);
        if (!assignSafeRedirectUrl(data.url)) {
          toast.error("Couldn't open checkout. Try again.");
        }
        return;
      }
      if (res.status === 409 && data.code === "use_portal") {
        toast.info(
          typeof data.error === "string"
            ? data.error
            : "You have an unpaid subscription. Opening billing so you can fix it.",
        );
        if (typeof data.url === "string") {
          if (!assignSafeRedirectUrl(data.url)) {
            toast.error("Couldn't open billing. Try again.");
          }
          return;
        }
        if (await openPortal()) return;
      }
      if (res.status === 409 && data.code === "checkout_in_progress") {
        setStuckCheckoutPlan(plan);
        toast.info(
          typeof data.error === "string"
            ? `${data.error} If it stays stuck, start a fresh checkout.`
            : "A checkout is already being prepared. If it stays stuck, start a fresh checkout.",
        );
        return;
      }
      if (res.status === 409 && data.code === "use_change_plan") {
        toast.info(
          typeof data.error === "string"
            ? data.error
            : "You already have a subscription. Change plans from Billing.",
        );
        // Someone with a subscription is past onboarding; finish it so the
        // dashboard gate doesn't send them back here.
        await finish({ at: "plans_dialog", to: "/dashboard/billing" });
        return;
      }
      toast.error(
        toFriendlyCheckoutError(
          data.error,
          "Couldn't start checkout. Try again in a moment.",
        ),
      );
    } catch {
      toast.error("Couldn't reach billing. Check your connection and try again.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-tight">Plans</DialogTitle>
          <DialogDescription>
            Free needs no card: {freeAccounts} accounts and {freePosts} posts.
            Upgrade anytime for more accounts, unlimited posts and automations.
          </DialogDescription>
        </DialogHeader>

        {stuckCheckoutPlan ? (
          <div className="flex flex-col gap-3 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
            <p>
              Your last checkout looks stuck. Start a fresh one to get a new
              payment page.
            </p>
            <button
              type="button"
              onClick={() =>
                void handleSelectPlan(stuckCheckoutPlan, {
                  forceNewSession: true,
                })
              }
              disabled={loadingPlan !== null}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-warning-border bg-background px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              {loadingPlan === stuckCheckoutPlan ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Starting…
                </>
              ) : (
                "Start a fresh checkout"
              )}
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Unlimited posts on every plan. Cancel anytime.
          </p>
          <BillingIntervalToggle
            value={interval}
            onChange={setBillingInterval}
            size="sm"
          />
        </div>

        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2">
          {PAID_PLANS.map((plan) => {
            const name = PLAN_NAMES[plan.id];
            const price = planPriceForAccounts(plan.id, 0, interval);
            const expanded = expandedPlans[plan.id] === true;
            const features = expanded
              ? fullPlanFeatureTexts(plan.id)
              : [...ONBOARDING_PLAN_HIGHLIGHTS[plan.id]];
            return (
              <section
                key={plan.id}
                aria-labelledby={`onb-plan-${plan.id}`}
                className={cn(
                  "relative flex h-full flex-col rounded-2xl border bg-card p-5",
                  plan.emphasized ? "border-accent ring-1 ring-accent" : "border-border",
                )}
              >
                {plan.badge ? (
                  <span
                    className={cn(
                      "absolute right-4 top-4 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      plan.emphasized
                        ? "bg-ok-soft text-ok"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {plan.badge}
                  </span>
                ) : null}
                <h3
                  id={`onb-plan-${plan.id}`}
                  className="pr-16 text-base font-semibold text-foreground"
                >
                  {name}
                </h3>
                <div className="mt-2">
                  <PlanDiscountPrice
                    amount={price}
                    period={interval === "yearly" ? "/year" : "/month"}
                    size="md"
                  />
                </div>
                {interval === "yearly" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    ≈ ${perMonth(price)}/month, 2 months free
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  {plan.tagline}
                </p>
                {plan.id === "agency" ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {AGENCY_INCLUDED_ACCOUNTS} accounts included. {AGENCY_EXTRA_ACCOUNT_NOTE}
                  </p>
                ) : null}
                <ul className="mt-4 flex-1 space-y-1.5 text-sm text-muted-foreground">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok"
                        aria-hidden
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedPlans((prev) => ({ ...prev, [plan.id]: !expanded }))
                  }
                  aria-expanded={expanded}
                  className="mt-2 self-start rounded-sm text-left text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {expanded ? "Show less" : "See everything included"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSelectPlan(plan.id)}
                  disabled={loadingPlan !== null}
                  className={cn(
                    "mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
                    plan.emphasized
                      ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                      : "border border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {loadingPlan === plan.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Opening checkout…
                    </>
                  ) : (
                    `Choose ${name}`
                  )}
                </button>
              </section>
            );
          })}
        </div>

        <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row">
          <a
            href="/pricing#compare"
            target="_blank"
            rel="noopener noreferrer"
            className={onboardingGhostLinkClass}
          >
            Compare all plans
          </a>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto"
          >
            Stay on Free
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

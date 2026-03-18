"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { IconLoader2 } from "@tabler/icons-react";
import { DOCS_ONBOARDING_URL } from "@/lib/docs-url";
import { toast } from "sonner";

const PAYMENT_FAILED_MESSAGE =
  "Payment failed. Please check your payment method and try again.";

const STARTER_FEATURES = [
  "Connect up to 5 accounts",
  "Multiple accounts per platform",
  "Unlimited posts",
  "Schedule posts across platforms",
  "Carousel posts",
  "Threads & Collections support",
  "300 tweets/month (Twitter/X)",
  "Fair usage policy",
  "Human support",
];

const GROWTH_FEATURES = [
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
];

const PRO_FEATURES = [
  "Unlimited connected accounts",
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
  "Priority support",
  "Early access to new features",
];

function OnboardingPlanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<
    "starter" | "growth" | "pro" | null
  >(null);

  useEffect(() => {
    if (searchParams.get("payment_failed") === "1") {
      toast.error(PAYMENT_FAILED_MESSAGE);
      router.replace("/onboarding", { scroll: false });
    }
  }, [searchParams, router]);

  async function handleSelectPlan(plan: "starter" | "growth" | "pro") {
    toast.dismiss();
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan,
          successUrl: "/onboarding/step2?paid=1",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error ?? "Failed to start checkout");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <a
        href={DOCS_ONBOARDING_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <svg
          className="w-4 h-4"
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
      <h1 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-2">
        Choose your plan
      </h1>
      <p className="text-center text-muted-foreground mb-8">
        Early adopter pricing. Lock in before price increases.
      </p>

      {/* Pro tier commented out for now — add back later */}
      <div className="grid gap-6 sm:grid-cols-2 mb-8">
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold text-foreground">
            Starter (Lite) —{" "}
            <span className="line-through text-muted-foreground">$9</span>{" "}
            <span className="text-foreground">$6</span>/month
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Early adopter pricing
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            {STARTER_FEATURES.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-emerald-500 shrink-0">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => handleSelectPlan("starter")}
            disabled={loadingPlan !== null}
            className="mt-6 w-full rounded-xl border-2 border-emerald-500 bg-transparent px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
          >
            {loadingPlan === "starter" ? (
              <>
                <IconLoader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  strokeWidth={1.5}
                />
                Redirecting to checkout…
              </>
            ) : (
              "Choose Starter"
            )}
          </button>
        </div>

        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-500/5 p-6 shadow-sm relative">
          <span className="absolute top-4 right-4 rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Most popular
          </span>
          <h2 className="font-semibold text-foreground">
            Growth —{" "}
            <span className="line-through text-muted-foreground">$29</span>{" "}
            <span className="text-foreground">$19</span>/month
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Early adopter pricing
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            {GROWTH_FEATURES.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-emerald-500 shrink-0">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => handleSelectPlan("growth")}
            disabled={loadingPlan !== null}
            className="mt-6 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
          >
            {loadingPlan === "growth" ? (
              <>
                <IconLoader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  strokeWidth={1.5}
                />
                Redirecting to checkout…
              </>
            ) : (
              "Choose Growth"
            )}
          </button>
        </div>

        {/* Pro tier commented out for now — add back later
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold text-foreground">
            Pro — <span className="line-through text-muted-foreground">$49</span>{" "}
            <span className="text-foreground">$35</span>/month
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Early adopter pricing · Save 33%
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            {PRO_FEATURES.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-emerald-500 shrink-0">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => handleSelectPlan("pro")}
            disabled={loadingPlan !== null}
            className="mt-6 w-full rounded-xl border-2 border-emerald-500 bg-transparent px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
          >
            {loadingPlan === "pro" ? "Redirecting…" : "Choose Pro"}
          </button>
        </div>
        */}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/onboarding/step2"
          className="font-medium text-foreground hover:underline"
        >
          I&apos;ll decide later →
        </Link>
      </p>
    </div>
  );
}

export default function OnboardingPlanPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPlanContent />
    </Suspense>
  );
}

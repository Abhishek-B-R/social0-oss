"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { IconLoader2 } from "@tabler/icons-react";
import { setOnboardingCompleted } from "@/app/actions/onboarding";
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
    title: "10 free posts",
    description: "Try scheduling and publishing before you upgrade.",
  },
  {
    title: "All post types",
    description: "Text, image, video, threads, and collections.",
  },
];

const STARTER_FEATURES = [
  "Connect up to 5 accounts",
  "Unlimited posts",
  "Schedule posts across platforms",
  "Threads & Collections support",
];

const GROWTH_FEATURES = [
  "All features from Lite plan",
  "Up to 15 connected accounts",
  "Unlimited posts",
  "Auto-plug & auto-repost",
  "Bulk scheduling tools",
];

function OnboardingWelcomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<
    "starter" | "growth" | "pro" | null
  >(null);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    if (searchParams.get("payment_failed") === "1") {
      toast.error(PAYMENT_FAILED_MESSAGE);
      router.replace("/onboarding", { scroll: false });
    }
  }, [searchParams, router]);

  async function handleExploreDashboard() {
    setSkipping(true);
    try {
      await setOnboardingCompleted();
      router.push("/dashboard");
    } finally {
      setSkipping(false);
    }
  }

  async function handleSelectPlan(plan: "starter" | "growth" | "pro") {
    if (loadingPlan !== null) return;
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
      if ((res.ok || res.status === 409) && typeof data.url === "string") {
        if (res.status === 409 && data.code === "checkout_in_progress") {
          toast.info("Opening your existing checkout…");
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
        const portalRes = await fetch("/api/billing/portal", {
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
        router.push("/dashboard/billing");
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
    <div className="relative flex w-full flex-1 flex-col">
      <a
        href={DOCS_ONBOARDING_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-0 top-0 z-10 rounded-full p-1.5 text-text-muted hover:bg-muted hover:text-text transition-colors"
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

      <div className="grid w-full flex-1 gap-8 lg:grid-cols-2 lg:gap-12 xl:gap-16">
        {/* Left - hero + free tier */}
        <div className="flex flex-col justify-center lg:py-4">
          <p className="mb-3 text-sm font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Free to start
          </p>
          <h1 className="font-serif text-3xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Welcome to Social0
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Schedule and publish to all your socials from one place. No credit
            card needed to try it.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
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

          <div className="mt-10 flex flex-col gap-3 sm:flex-row lg:max-w-lg">
            <Link
              href="/onboarding/step3"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
            >
              Connect your first account →
            </Link>
            <button
              type="button"
              onClick={handleExploreDashboard}
              disabled={skipping}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-border px-6 py-3.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
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
          </div>
        </div>

        {/* Right - paid plans */}
        <div className="flex flex-col justify-center rounded-2xl border border-border bg-muted/30 p-6 sm:p-8 lg:p-10">
          <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Need more? Upgrade anytime
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            7-day free trial · cancel anytime · lock in early-adopter pricing
          </p>

          <div className="mt-8 grid flex-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="font-semibold text-foreground">
                Starter - <span className="text-foreground">$9</span>/mo
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                For creators getting started
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                {STARTER_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-emerald-500 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleSelectPlan("starter")}
                disabled={loadingPlan !== null}
                className="mt-6 w-full rounded-xl border-2 border-emerald-500 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
              >
                {loadingPlan === "starter"
                  ? "Redirecting…"
                  : "Start free trial"}
              </button>
            </div>

            <div className="relative flex flex-col rounded-2xl border-2 border-emerald-500 bg-emerald-500/5 p-5 shadow-sm">
              <span className="absolute top-4 right-4 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Popular
              </span>
              <h3 className="font-semibold text-foreground">
                Growth -{" "}
                <span className="line-through text-muted-foreground">$29</span>{" "}
                <span className="text-foreground">$19</span>/mo
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Early adopter pricing
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                {GROWTH_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-emerald-500 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleSelectPlan("growth")}
                disabled={loadingPlan !== null}
                className="mt-6 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {loadingPlan === "growth" ? "Redirecting…" : "Start free trial"}
              </button>
            </div>
          </div>
        </div>
      </div>
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

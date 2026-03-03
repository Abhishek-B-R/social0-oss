"use client";

import Link from "next/link";
import { RevealSection } from "@/components/landing/RevealSection";

const plans = [
  {
    name: "Starter",
    price: "$6",
    period: "/month",
    target: "Best for testing cross-posting",
    features: [
      "Connect up to 5 accounts",
      "Multiple accounts per platform",
      "Unlimited posts",
      "Schedule posts across platforms",
      "Carousel posts",
      "Threads & Collections support",
      "Fair usage policy",
      "Human support",
    ],
    cta: "Get started for 7-day free trial",
    href: "/auth",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "$20",
    period: "/month",
    target: "Best for serious creators",
    features: [
      "Up to 15 connected accounts",
      "Multiple accounts per platform",
      "Unlimited posts",
      "Schedule posts across platforms",
      "Carousel posts",
      "Threads & Collections support",
      "Fair usage policy",
      "Auto-plug high performing tweets",
      "Auto-repost on autopilot",
      "Bulk scheduling tools",
      "Human support",
    ],
    cta: "Get started for 7-day free trial",
    href: "/auth",
    highlighted: true,
    badge: "Most popular",
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-16 sm:py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <RevealSection>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-4">
            Choose your plan
          </h2>
          <p className="text-base text-muted-foreground text-center max-w-xl mx-auto mb-12 font-medium">
            Choose the plan that matches where you are.
          </p>
        </RevealSection>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, i) => (
            <RevealSection key={plan.name} delay={i as 0 | 1}>
              <div
                className={`relative rounded-2xl border-2 p-8 flex flex-col h-full ${
                  plan.highlighted
                    ? "border-emerald-600 bg-card shadow-lg dark:border-emerald-500"
                    : "border-border bg-card"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white text-xs font-semibold">
                    {plan.badge}
                  </div>
                )}
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  {plan.name}
                </h3>
                <p className="text-muted-foreground text-sm mb-3">
                  {plan.target}
                </p>
                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-3xl font-bold text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="space-y-2.5 mb-4 flex-1">
                  {plan.features.map((f, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <span className="text-emerald-600 dark:text-emerald-400 shrink-0">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href ?? "/auth"}
                  className={`mt-auto w-full inline-flex items-center justify-center py-4 px-4 rounded-xl font-semibold transition-colors ${
                    plan.highlighted
                      ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white shadow-md hover:shadow-lg"
                      : "border-2 border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

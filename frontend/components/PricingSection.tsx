"use client";

import { signIn } from "@/lib/auth-client";
import { RevealSection } from "@/components/RevealSection";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started and connect your accounts.",
    features: [
      "Connect up to 3 platforms",
      "Schedule and publish posts",
      "Text, image & video posts",
      "Secure OAuth connections",
    ],
    cta: "Get started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    description: "For creators and small teams who need more.",
    features: [
      "Unlimited connected platforms",
      "Advanced scheduling",
      "Threads & blog-style posts",
      "Priority support",
    ],
    cta: "Get started",
    highlighted: true,
    badge: "Popular",
  },
];

export function PricingSection() {
  const handleGetStarted = () => {
    signIn.social({
      provider: "google",
      callbackURL: "/dashboard/posts/new",
    });
  };

  return (
    <section id="pricing" className="py-16 sm:py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <RevealSection>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4">
            Choose your plan
          </h2>
          <p className="text-base text-gray-500 text-center max-w-xl mx-auto mb-12 font-medium">
            Start free. Upgrade when you need more platforms and power.
          </p>
        </RevealSection>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, i) => (
            <RevealSection key={plan.name} delay={i as 0 | 1}>
              <div
                className={`relative rounded-2xl border-2 p-8 flex flex-col h-full ${
                  plan.highlighted
                    ? "border-emerald-600 bg-white shadow-lg"
                    : "border-gray-200 bg-white"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-semibold">
                    {plan.badge}
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {plan.name}
                </h3>
                <p className="text-gray-500 text-base mb-4">
                  {plan.description}
                </p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold text-gray-900">
                    {plan.price}
                  </span>
                  <span className="text-gray-600">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-base text-gray-500"
                    >
                      <span className="text-emerald-600">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleGetStarted}
                  className={`w-full py-4 px-4 rounded-xl font-semibold transition-colors ${
                    plan.highlighted
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-800"
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import { Check } from "lucide-react";

const STEPS = [
  { num: 1, label: "Choose plan", path: "/onboarding" },
  { num: 2, label: "Your goal", path: "/onboarding/step2" },
  { num: 3, label: "Connect", path: "/onboarding/step3" },
  { num: 4, label: "All set", path: "/onboarding/step4" },
] as const;

type OnboardingProgressProps = {
  currentStep: number; // 1–4
};

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-1 sm:gap-2 text-sm"
      aria-label="Onboarding progress"
    >
      {STEPS.map((step, i) => {
        const isCurrent = step.num === currentStep;
        const isPast = step.num < currentStep;
        return (
          <span key={step.num} className="flex items-center gap-1 sm:gap-2">
            {i > 0 && (
              <span
                className={`hidden sm:inline w-6 h-px ${
                  isPast ? "bg-emerald-500" : "bg-border"
                }`}
                aria-hidden
              />
            )}
            {isPast ? (
              <span
                className="flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 font-medium cursor-default"
                aria-label={`${step.num}. ${step.label} (completed)`}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only sm:not-sr-only">{step.num}. {step.label}</span>
              </span>
            ) : isCurrent ? (
              <span
                className="flex items-center gap-1 rounded-full bg-emerald-500 text-white px-2.5 py-1 font-medium"
                aria-current="step"
              >
                <span aria-hidden>{step.num}</span>
                <span className="sr-only sm:not-sr-only">{step.label}</span>
              </span>
            ) : (
              <span
                className="flex items-center gap-1 rounded-full border border-border bg-muted/50 text-muted-foreground px-2.5 py-1"
                aria-hidden
              >
                <span>{step.num}</span>
                <span className="hidden sm:inline">{step.label}</span>
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

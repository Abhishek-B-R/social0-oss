import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { num: 1, label: "Welcome" },
  { num: 2, label: "Connect" },
  { num: 3, label: "Plan" },
  { num: 4, label: "Ready" },
] as const;

type OnboardingProgressBarProps = {
  currentStep: number; // 1–4
};

export function OnboardingProgressBar({
  currentStep,
}: OnboardingProgressBarProps) {
  const clamped = Math.min(4, Math.max(1, currentStep));
  const progressPct = ((clamped - 1) / (STEPS.length - 1)) * 100;

  return (
    <nav className="w-full max-w-md" aria-label="Onboarding progress">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        {STEPS.map((step) => {
          const isCurrent = step.num === clamped;
          const isPast = step.num < clamped;
          return (
            <span
              key={step.num}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition-colors",
                  isPast &&
                    "bg-emerald-500 text-[#04140c] shadow-[0_0_0_3px_rgba(16,185,129,0.18)]",
                  isCurrent &&
                    "bg-emerald-500 text-[#04140c] shadow-[0_0_16px_rgba(16,185,129,0.35)]",
                  !isPast &&
                    !isCurrent &&
                    "border border-border bg-background/80 text-muted-foreground",
                )}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${step.num}. ${step.label}${isPast ? " (completed)" : ""}`}
              >
                {isPast ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                ) : (
                  step.num
                )}
              </span>
              <span
                className={cn(
                  "hidden truncate text-[11px] font-medium sm:block",
                  isCurrent
                    ? "text-foreground"
                    : isPast
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </span>
          );
        })}
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-border/80"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={1}
        aria-valuemax={4}
        aria-label={`Step ${clamped} of 4`}
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </nav>
  );
}

import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { usePostHog } from "@posthog/react";
import { setOnboardingGoal } from "@/api/onboarding";
import { DOCS_ONBOARDING_GOAL_URL } from "@/lib/docs-url";
import { ONBOARDING_GOALS } from "@/features/onboarding/lib/goals";
import { ONBOARDING_PATHS } from "@/features/onboarding/lib/paths";
import { PlatformStrip } from "@/components/landing/PlatformStrip";
import {
  OnboardingDocsLink,
  OnboardingStepFrame,
  OnboardingStepHeader,
  onboardingGhostLinkClass,
  onboardingPrimaryCtaClass,
} from "@/features/onboarding/components/onboarding-ui";
import { cn } from "@/lib/utils";

/** Step 1 — welcome + optional goal (orient before activation). */
export default function OnboardingWelcomePage() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function goNext(goalId: string | null) {
    setSaving(true);
    try {
      if (goalId) {
        await setOnboardingGoal(goalId);
        posthog?.capture("onboarding_goal_selected", { goal: goalId });
      }
      navigate(ONBOARDING_PATHS.connect, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardingStepFrame narrow className="items-center justify-center">
      <div className="relative w-full">
        <OnboardingDocsLink href={DOCS_ONBOARDING_GOAL_URL} />

        <div className="mb-8 flex justify-center">
          <PlatformStrip variant="hero" className="max-w-md scale-[0.85] sm:scale-90" />
        </div>

        <OnboardingStepHeader
          eyebrow="Welcome"
          title={
            <>
              Let&apos;s get you{" "}
              <em className="not-italic text-emerald-600 dark:text-emerald-400">
                posting everywhere
              </em>
            </>
          }
          description="One quick preference — then connect an account. Free to start, no credit card."
        />

        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ONBOARDING_GOALS.map((goal) => {
            const active = selected === goal.id;
            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => setSelected(goal.id)}
                className={cn(
                  "rounded-2xl border px-4 py-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]",
                  active
                    ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]"
                    : "border-border/80 bg-card/70 hover:border-emerald-300/80 hover:bg-muted/40",
                )}
              >
                <p className="font-semibold text-foreground">{goal.label}</p>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  {goal.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void goNext(selected)}
            disabled={saving || !selected}
            className={cn(onboardingPrimaryCtaClass, "w-full sm:w-auto")}
          >
            {saving ? "Saving…" : "Continue"}
            <span aria-hidden>→</span>
          </button>
          <button
            type="button"
            onClick={() => void goNext(null)}
            disabled={saving}
            className={onboardingGhostLinkClass}
          >
            Skip — I&apos;ll decide later
          </button>
        </div>
      </div>
    </OnboardingStepFrame>
  );
}

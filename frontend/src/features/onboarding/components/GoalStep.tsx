import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { Briefcase, Compass, Sparkles, Users } from "lucide-react";
import {
  getOnboardingStatus,
  setOnboardingGoal,
  type OnboardingStatus,
} from "@/api/onboarding";
import { DOCS_ONBOARDING_GOAL_URL } from "@/lib/docs-url";
import { cn } from "@/lib/utils";
import {
  isOnboardingGoal,
  ONBOARDING_GOALS,
  type OnboardingGoalId,
} from "@/features/onboarding/lib/goals";
import { ONBOARDING_PATHS } from "@/features/onboarding/lib/paths";
import {
  ChoiceCard,
  OnboardingStepFrame,
  OnboardingStepHeader,
} from "./onboarding-ui";
import {
  onboardingGhostLinkClass,
  onboardingPrimaryCtaClass,
} from "./onboarding-styles";
import { useRadioGroupKeys } from "./use-radio-group-keys";

const GOAL_ICONS: Record<OnboardingGoalId, typeof Sparkles> = {
  personal_brand: Sparkles,
  business: Briefcase,
  clients: Users,
  exploring: Compass,
};

const GOAL_IDS = ONBOARDING_GOALS.map((g) => g.id);

/** Step 1: what brings you here (optional, tunes the copy on step 2). */
export function GoalStep() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
  });
  const rawGoal = status?.onboardingGoal;
  const savedGoal = isOnboardingGoal(rawGoal) ? rawGoal : null;
  const [picked, setPicked] = useState<OnboardingGoalId | null>(null);
  const selected = picked ?? savedGoal;
  const [saving, setSaving] = useState(false);
  const { itemProps } = useRadioGroupKeys(GOAL_IDS, selected, setPicked);

  async function goNext(goalId: OnboardingGoalId | null) {
    setSaving(true);
    if (goalId && goalId !== savedGoal) {
      try {
        await setOnboardingGoal(goalId);
        posthog?.capture("onboarding_goal_selected", { goal: goalId });
        queryClient.setQueryData<OnboardingStatus | null>(
          ["onboarding-status"],
          (prev) => (prev ? { ...prev, onboardingGoal: goalId } : prev),
        );
      } catch {
        // The goal only tunes copy on the next step; never block on it.
      }
    }
    if (!goalId) posthog?.capture("onboarding_goal_skipped");
    navigate(ONBOARDING_PATHS.connect);
  }

  return (
    <OnboardingStepFrame>
      <OnboardingStepHeader
        step={1}
        docsHref={DOCS_ONBOARDING_GOAL_URL}
        title="What brings you to Social0?"
        description="Pick the closest one. It only changes the tips you see. Free to start, no card needed."
      />

      <div
        role="radiogroup"
        aria-label="Your goal"
        className="mb-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {ONBOARDING_GOALS.map((goal) => {
          const Icon = GOAL_ICONS[goal.id];
          return (
            <ChoiceCard
              key={goal.id}
              selected={selected === goal.id}
              onSelect={() => setPicked(goal.id)}
              title={goal.label}
              description={goal.description}
              icon={<Icon className="h-4 w-4" />}
              {...itemProps(goal.id)}
            />
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() => void goNext(null)}
          disabled={saving}
          className={cn(onboardingGhostLinkClass, "order-2 sm:order-1")}
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={() => void goNext(selected)}
          disabled={saving || !selected}
          className={cn(onboardingPrimaryCtaClass, "order-1 w-full sm:order-2 sm:w-auto")}
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </OnboardingStepFrame>
  );
}

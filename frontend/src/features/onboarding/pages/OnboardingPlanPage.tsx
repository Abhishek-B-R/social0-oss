import { OnboardingStepPage } from "@/features/onboarding/components/OnboardingStepPage";
import { PostModeStep } from "@/features/onboarding/components/PostModeStep";

/**
 * /onboarding/step3: step 3, "How will you post?".
 *
 * This URL used to be the plan picker, so checkouts started before the
 * redesign still return here with `?paid=1`; OnboardingStepPage confirms them.
 * Plans now live in a dialog any step can open (`?plans=1`).
 */
export default function OnboardingPlanPage() {
  return (
    <OnboardingStepPage>
      {(openPlans) => <PostModeStep onOpenPlans={openPlans} />}
    </OnboardingStepPage>
  );
}

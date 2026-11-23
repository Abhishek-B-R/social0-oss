import { GoalStep } from "@/features/onboarding/components/GoalStep";
import { OnboardingStepPage } from "@/features/onboarding/components/OnboardingStepPage";

/** /onboarding: step 1, goal. */
export default function OnboardingWelcomePage() {
  return <OnboardingStepPage>{() => <GoalStep />}</OnboardingStepPage>;
}

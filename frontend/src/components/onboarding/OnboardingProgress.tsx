import { useLocation } from "react-router-dom";
import { OnboardingProgressBar } from "./OnboardingProgressBar";
import { onboardingStepFromPath } from "@/features/onboarding/lib/paths";

/** Progress for the current onboarding route (rendered by OnboardingLayout). */
export function OnboardingProgress() {
  const { pathname } = useLocation();
  return <OnboardingProgressBar currentStep={onboardingStepFromPath(pathname)} />;
}

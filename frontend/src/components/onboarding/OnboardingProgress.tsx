import { useLocation } from "react-router-dom";
import { OnboardingProgressBar } from "./OnboardingProgressBar";
import { ONBOARDING_PATHS } from "@/features/onboarding/lib/paths";

function stepFromPath(pathname: string): number {
  if (
    pathname === ONBOARDING_PATHS.welcome ||
    pathname === `${ONBOARDING_PATHS.welcome}/`
  ) {
    return 1;
  }
  if (pathname.startsWith(ONBOARDING_PATHS.connect)) return 2;
  if (pathname.startsWith(ONBOARDING_PATHS.plan)) return 3;
  if (pathname.startsWith(ONBOARDING_PATHS.ready)) return 4;
  return 1;
}

export function OnboardingProgress() {
  const pathname = useLocation().pathname;
  return <OnboardingProgressBar currentStep={stepFromPath(pathname ?? "")} />;
}

import { useLocation } from "react-router-dom";
import { OnboardingProgressBar } from "./OnboardingProgressBar";

function stepFromPath(pathname: string): number {
  if (pathname === "/onboarding" || pathname === "/onboarding/") return 1;
  if (pathname === "/onboarding/step2") return 1;
  if (pathname === "/onboarding/step3") return 2;
  if (pathname === "/onboarding/step4") return 3;
  return 1;
}

export function OnboardingProgress() {
  const pathname = useLocation().pathname;
  const step = stepFromPath(pathname ?? "");
  return <OnboardingProgressBar currentStep={step} />;
}

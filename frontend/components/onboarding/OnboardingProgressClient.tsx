"use client";

import { usePathname } from "next/navigation";
import { OnboardingProgress } from "./OnboardingProgress";

function stepFromPath(pathname: string): number {
  if (pathname === "/onboarding" || pathname === "/onboarding/") return 1;
  if (pathname === "/onboarding/step2") return 2;
  if (pathname === "/onboarding/step3") return 3;
  if (pathname === "/onboarding/step4") return 4;
  return 1;
}

export function OnboardingProgressClient() {
  const pathname = usePathname();
  const step = stepFromPath(pathname ?? "");
  return <OnboardingProgress currentStep={step} />;
}

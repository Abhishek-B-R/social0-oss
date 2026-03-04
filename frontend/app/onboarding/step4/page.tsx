import { setOnboardingCompleted } from "@/app/actions/onboarding";
import { OnboardingStep4Client } from "./OnboardingStep4Client";

export default async function OnboardingStep4Page() {
  await setOnboardingCompleted();
  return <OnboardingStep4Client />;
}

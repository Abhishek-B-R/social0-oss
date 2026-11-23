import { ConnectStep } from "@/features/onboarding/components/ConnectStep";
import { OnboardingStepPage } from "@/features/onboarding/components/OnboardingStepPage";

/** /onboarding/step2: step 2, connect accounts (OAuth returns here). */
export default function OnboardingConnectPage() {
  return (
    <OnboardingStepPage>
      {(openPlans) => <ConnectStep onOpenPlans={openPlans} />}
    </OnboardingStepPage>
  );
}

import { useEffect } from "react";
import { setOnboardingCompleted } from "@/api/onboarding";
import { ReadyStep } from "@/features/onboarding/components/ReadyStep";
import { usePostHog } from "@posthog/react";

/** Step 4 — celebrate + push to first post (activation event). */
export default function OnboardingReadyPage() {
  const posthog = usePostHog();

  useEffect(() => {
    void setOnboardingCompleted();
    posthog?.capture("onboarding_completed");
  }, [posthog]);

  return <ReadyStep />;
}

import { rpc } from "@/lib/rpc";

export type OnboardingStatus = {
  onboardingCompleted: boolean;
  onboardingGoal: string | null;
  hasSubscription: boolean;
  connectedAccountsCount: number;
  shouldOnboard: boolean;
};

export async function getOnboardingStatus(): Promise<OnboardingStatus | null> {
  return rpc<OnboardingStatus | null>("onboarding.getOnboardingStatus");
}

export async function setOnboardingGoal(goal: string): Promise<void> {
  await rpc("onboarding.setOnboardingGoal", goal);
}

export async function setOnboardingCompleted(): Promise<void> {
  await rpc("onboarding.setOnboardingCompleted");
}

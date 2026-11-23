export const ONBOARDING_GOALS = [
  {
    id: "personal_brand",
    label: "Grow my personal brand",
    description: "Post consistently across the platforms that matter.",
    connectHint: "Connect the account you post from most.",
  },
  {
    id: "business",
    label: "Promote my business",
    description: "One place to schedule brand posts everywhere.",
    connectHint: "Connect your brand's main social account.",
  },
  {
    id: "clients",
    label: "Manage clients",
    description: "Publish for clients without juggling logins.",
    connectHint: "Connect a client account to start managing.",
  },
  {
    id: "exploring",
    label: "Just exploring",
    description: "Try Social0 free. No credit card needed.",
    connectHint: "Pick any network to see how publishing works.",
  },
] as const;

export type OnboardingGoalId = (typeof ONBOARDING_GOALS)[number]["id"];

export function isOnboardingGoal(value: unknown): value is OnboardingGoalId {
  return ONBOARDING_GOALS.some((g) => g.id === value);
}

export function goalCopy(goalId: string | null | undefined) {
  return (
    ONBOARDING_GOALS.find((g) => g.id === goalId) ?? ONBOARDING_GOALS[3]
  );
}

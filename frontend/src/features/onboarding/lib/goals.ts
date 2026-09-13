export const ONBOARDING_GOALS = [
  {
    id: "personal_brand",
    label: "Grow my personal brand",
    description: "Post consistently across the platforms that matter.",
    connectHint: "Connect the account you post from most.",
    readyHint: "Your posts can go live in under a minute.",
  },
  {
    id: "business",
    label: "Promote my business",
    description: "One place to schedule brand posts everywhere.",
    connectHint: "Connect your brand’s main social account.",
    readyHint: "Schedule a launch post and stop copy-pasting.",
  },
  {
    id: "clients",
    label: "Manage clients",
    description: "Publish for clients without juggling logins.",
    connectHint: "Connect a client account to start managing.",
    readyHint: "Draft once, publish to every client channel.",
  },
  {
    id: "exploring",
    label: "Just exploring",
    description: "Try Social0 free — no credit card needed.",
    connectHint: "Pick any platform to see how publishing works.",
    readyHint: "Explore the composer — upgrade only when you need more.",
  },
] as const;

export function goalCopy(goalId: string | null | undefined) {
  return (
    ONBOARDING_GOALS.find((g) => g.id === goalId) ?? ONBOARDING_GOALS[3]
  );
}

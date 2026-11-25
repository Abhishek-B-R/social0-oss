import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { setOnboardingCompleted, type OnboardingStatus } from "@/api/onboarding";
import { ONBOARDING_FINISH_PATH } from "@/features/onboarding/lib/paths";
import { HANDOFF_PATH, hasPendingHandoff } from "@/lib/tool-handoff";
import type { PostMode } from "@/features/onboarding/lib/agent-setup";

type FinishOptions = {
  /** What the user picked on "How will you post?" (null = skipped). */
  postMode?: PostMode | null;
  /** Where the user finished from, for analytics ("post_mode", "legacy_ready", …). */
  at: string;
  /** True when the user took the step's skip link. */
  skipped?: boolean;
  /** Where to land. Defaults to Home. */
  to?: string;
};

/**
 * Marks onboarding complete and lands on Home.
 *
 * The `["onboarding-status"]` cache is patched before navigating: the gate in
 * DashboardLayout reads it, and a stale `shouldOnboard: true` would bounce the
 * user straight back to /onboarding.
 */
export function useFinishOnboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const posthog = usePostHog();
  const [finishing, setFinishing] = useState(false);
  const inFlight = useRef(false);

  const finish = useCallback(
    async ({
      postMode = null,
      at,
      skipped = false,
      to = ONBOARDING_FINISH_PATH,
    }: FinishOptions) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setFinishing(true);
      try {
        await setOnboardingCompleted();
      } catch {
        inFlight.current = false;
        setFinishing(false);
        toast.error("Couldn't finish setup. Check your connection and try again.", {
          id: "onboarding-finish-failed",
        });
        return false;
      }

      if (skipped) {
        posthog?.capture("onboarding_skipped", { at });
      }
      posthog?.capture("onboarding_completed", {
        at,
        post_mode: postMode ?? "undecided",
      });

      // Only flip `shouldOnboard`: OnboardingLayout redirects to /dashboard as
      // soon as it sees `onboardingCompleted`, which would race this navigate
      // (and lose `to`). Marking the query stale without refetching lets the
      // dashboard's own observer load the real status on mount.
      queryClient.setQueryData<OnboardingStatus | null>(
        ["onboarding-status"],
        (prev) => (prev ? { ...prev, shouldOnboard: false } : prev),
      );
      void queryClient.invalidateQueries({
        queryKey: ["onboarding-status"],
        refetchType: "none",
      });
      // Came from a free tool's "Post it everywhere": open the composer with it.
      navigate(to === ONBOARDING_FINISH_PATH && hasPendingHandoff() ? HANDOFF_PATH : to, { replace: true });
      return true;
    },
    [navigate, posthog, queryClient],
  );

  return { finish, finishing };
}

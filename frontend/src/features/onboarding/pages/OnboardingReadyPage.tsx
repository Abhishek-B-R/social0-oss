import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { OnboardingBusy } from "@/features/onboarding/components/onboarding-ui";
import { useFinishOnboarding } from "@/features/onboarding/components/use-finish-onboarding";
import { ONBOARDING_PATHS } from "@/features/onboarding/lib/paths";

/**
 * /onboarding/step4: the old "You're in" step. Setup now ends on step 3, so
 * this only finishes onboarding and lands on Home for old links and bookmarks.
 */
export default function OnboardingReadyPage() {
  const { finish } = useFinishOnboarding();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void finish({ at: "legacy_ready" }).then((ok) => {
      if (!ok) setFailed(true);
    });
  }, [finish]);

  if (!failed) return <OnboardingBusy label="Opening Home…" />;

  // Finishing failed (a toast already says why): offer the way back in.
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-sm text-muted-foreground">
        We couldn't finish setup just now.
      </p>
      <Link
        to={ONBOARDING_PATHS.postMode}
        className="rounded-sm text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Back to setup
      </Link>
    </div>
  );
}

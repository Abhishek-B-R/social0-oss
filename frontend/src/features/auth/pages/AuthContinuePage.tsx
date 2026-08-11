import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { getOnboardingStatus } from "@/api/onboarding";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";
import {
  AUTH_CONTINUE_PATH,
  resolvePostAuthDestination,
} from "@/lib/sign-in-url";
import { sanitizeReturnToPath } from "@/lib/safe-return-to";

/** Full-screen hold after sign-in while we pick dashboard vs onboarding. */
export default function AuthContinuePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: session, isPending: sessionPending } = useSession();

  const returnTo =
    sanitizeReturnToPath(searchParams.get("returnTo")) ?? undefined;

  const {
    data: status,
    isPending: statusPending,
    isError,
  } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
    enabled: !!session && session.user.emailVerified !== false,
    retry: 1,
  });

  useEffect(() => {
    if (sessionPending) return;

    if (!session) {
      navigate("/auth", { replace: true });
      return;
    }

    if (session.user.emailVerified === false) {
      navigate(
        `/auth/verify-email?email=${encodeURIComponent(session.user.email ?? "")}`,
        { replace: true },
      );
      return;
    }

    if (statusPending) return;

    if (isError || !status) {
      // Fail open to dashboard; DashboardLayout still gates shouldOnboard.
      const fallback =
        returnTo && !returnTo.startsWith(AUTH_CONTINUE_PATH)
          ? returnTo
          : "/dashboard";
      navigate(fallback, { replace: true });
      return;
    }

    navigate(resolvePostAuthDestination(status, returnTo), { replace: true });
  }, [
    session,
    sessionPending,
    status,
    statusPending,
    isError,
    returnTo,
    navigate,
  ]);

  return (
    <div className="landing landing-page flex min-h-screen flex-col bg-background text-foreground">
      <AuthBrandHeader />
      <main
        className="flex flex-1 flex-col items-center justify-center gap-4 px-5"
        aria-busy="true"
        aria-live="polite"
      >
        <svg
          className="h-8 w-8 animate-spin text-accent"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-sm text-muted-foreground">Getting things ready…</p>
      </main>
    </div>
  );
}

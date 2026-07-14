import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import Image from "@/components/AppImage";
import { useSession } from "@/lib/auth-client";
import { getOnboardingStatus, type OnboardingStatus } from "@/api/onboarding";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { LegalConsentGate } from "@/components/auth/LegalConsentGate";
import { useQuery } from "@tanstack/react-query";

export function OnboardingLayout() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const { data: status } = useQuery<OnboardingStatus | null>({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
    enabled: !!session,
  });

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      navigate("/auth", { replace: true });
      return;
    }
    if (session.user.emailVerified === false) {
      navigate(
        `/auth/verify-email?email=${encodeURIComponent(session.user.email ?? "")}`,
        { replace: true },
      );
    }
  }, [isPending, session, navigate]);

  useEffect(() => {
    if (status?.onboardingCompleted) {
      navigate("/dashboard", { replace: true });
    }
  }, [status, navigate]);

  return (
    <div className="landing flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
          <Link href="/onboarding" className="flex items-center gap-2">
            <span className="relative block h-9 w-9">
              <Image
                src="/logo-circular.webp"
                alt="Social0"
                width={36}
                height={36}
                className="rounded-lg dark:hidden"
              />
              <Image
                src="/logo-dark.webp"
                alt="Social0"
                width={36}
                height={36}
                className="absolute inset-0 hidden rounded-full border border-white dark:block"
              />
            </span>
            <span className="font-serif text-[22px] font-semibold tracking-tight text-foreground">
              Social0
            </span>
          </Link>
          <OnboardingProgress />
        </div>
      </header>
      <main className="flex flex-1 flex-col w-full px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        <Outlet />
      </main>
      {session && <LegalConsentGate />}
    </div>
  );
}

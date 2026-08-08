import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import Image from "@/components/AppImage";
import { useSession } from "@/lib/auth-client";
import { getOnboardingStatus, type OnboardingStatus } from "@/api/onboarding";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { GridBackground } from "@/components/landing/GridBackground";
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

  const firstName =
    session?.user?.name?.trim()?.split(/\s+/)[0] ||
    session?.user?.email?.split("@")[0] ||
    null;

  return (
    <div className="landing landing-page relative flex min-h-screen flex-col overflow-x-hidden bg-[#fafaf8] dark:bg-background">
      <GridBackground className="fixed inset-0" />

      <header className="sticky top-0 z-50 shrink-0 border-b border-border/60 bg-[#fafaf8]/80 backdrop-blur-md dark:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link
            href="/onboarding"
            className="flex shrink-0 items-center gap-2"
          >
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
            <span className="font-logo text-[22px] font-normal tracking-tight text-foreground">
              Social0
            </span>
          </Link>

          <div className="hidden min-w-0 flex-1 justify-center px-4 sm:flex">
            <OnboardingProgress />
          </div>

          <p className="hidden truncate text-right text-[13px] text-muted-foreground md:block md:max-w-[140px]">
            {firstName ? `Hi, ${firstName}` : "Setup"}
          </p>
        </div>
        <div className="border-t border-border/40 px-5 py-2.5 sm:hidden">
          <OnboardingProgress />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <Outlet />
      </main>
    </div>
  );
}

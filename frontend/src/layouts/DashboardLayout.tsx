import { useEffect } from "react";
import { usePostHog } from "@posthog/react";
import { SeoHead } from "@/components/seo/SeoHead";
import { dashboardSeo } from "@/lib/page-metadata";
import { absoluteUrl } from "@/lib/seo";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { SubscriptionSync } from "@/components/dashboard/SubscriptionSync";
import { GuestBanner } from "@/components/dashboard/GuestBanner";
import { GuestTestModeDialog } from "@/components/dashboard/GuestTestModeDialog";
import { FreePostsBanner } from "@/components/dashboard/FreePostsBanner";
import { ConnectAccountsBanner } from "@/components/dashboard/ConnectAccountsBanner";
import { LegalConsentGate } from "@/components/auth/LegalConsentGate";
import { useSessionResolved } from "@/lib/use-is-guest";
import { rpc } from "@/lib/rpc";
import { getOnboardingStatus, type OnboardingStatus } from "@/api/onboarding";

function getPlanLabel(tier: string): string {
  if (tier === "pro") return "Pro plan";
  if (tier === "growth") return "Growth plan";
  if (tier === "starter") return "Starter (Lite) plan";
  return "Free plan";
}

export function DashboardLayout() {
  const { session, isPending, isGuest } = useSessionResolved();
  const location = useLocation();
  const navigate = useNavigate();
  const posthog = usePostHog();

  useEffect(() => {
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) return;
    posthog?.identify(email, {
      email,
      name: session?.user.name ?? undefined,
    });
    // Session recording stays off on marketing pages; turn it on in-app only.
    posthog?.startSessionRecording?.();
  }, [session, posthog]);

  const { data: layoutData } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: () =>
      rpc<{
        planLabel: string;
        subscriptionTier: string;
        freePostsBanner: { remaining: number; limit: number } | null;
        profileName: string | null;
        profileImage: string | null;
      }>("dashboard-data.loadDashboardLayoutData"),
    enabled: !!session,
    retry: false,
  });

  const { data: onboarding } = useQuery<OnboardingStatus | null>({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
    enabled: !!session,
  });

  useEffect(() => {
    if (isPending) return;
    if (session?.user.emailVerified === false) {
      navigate(
        `/auth/verify-email?email=${encodeURIComponent(session.user.email ?? "")}`,
        { replace: true },
      );
    }
  }, [isPending, session, navigate]);

  useEffect(() => {
    if (!session || !onboarding) return;
    const isConnectFlow = location.pathname.startsWith("/dashboard/connect");
    if (onboarding.shouldOnboard && !isConnectFlow) {
      navigate("/onboarding", { replace: true });
    }
  }, [session, onboarding, location.pathname, navigate]);

  const showConnectBanner =
    onboarding != null &&
    onboarding.connectedAccountsCount === 0 &&
    !location.pathname.startsWith("/dashboard/connections");

  const sidebarUser =
    session && layoutData
      ? {
          ...session.user,
          name: layoutData.profileName ?? session.user.name,
          image: layoutData.profileImage ?? session.user.image,
        }
      : (session?.user ?? null);

  return (
    <div className="dashboard-shell flex h-screen overflow-hidden bg-bg">
      <SeoHead
        {...dashboardSeo}
        path={location.pathname}
        canonical={absoluteUrl(location.pathname)}
      />
      {session && layoutData?.subscriptionTier && (
        <SubscriptionSync tier={layoutData.subscriptionTier} />
      )}
      <DashboardSidebar
        user={sidebarUser}
        planLabel={
          isGuest
            ? "Guest"
            : layoutData
              ? getPlanLabel(layoutData.subscriptionTier)
              : "…"
        }
        isGuest={isGuest}
        sessionPending={isPending}
      />
      <main className="flex flex-1 flex-col min-h-0 overflow-y-auto pb-80 mb-20 lg:mb-0 lg:pb-0">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] 2xl:max-w-7xl flex-1 flex-col px-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-12 sm:pl-4 sm:pr-6 sm:pt-6 sm:pb-6 lg:px-8 lg:py-8 lg:pb-8">
          {isGuest && <GuestBanner />}
          {showConnectBanner && <ConnectAccountsBanner />}
          {layoutData?.freePostsBanner && (
            <FreePostsBanner
              remaining={layoutData.freePostsBanner.remaining}
              limit={layoutData.freePostsBanner.limit}
            />
          )}
          <Outlet />
        </div>
      </main>
      <DashboardBottomNav />
      {session && <LegalConsentGate />}
      {!isPending && isGuest && <GuestTestModeDialog />}
    </div>
  );
}

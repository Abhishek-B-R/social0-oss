import { useEffect } from "react";
import { usePostHog } from "@posthog/react";
import { SeoHead } from "@/components/seo/SeoHead";
import { dashboardSeo } from "@/lib/page-metadata";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { SubscriptionSync } from "@/components/dashboard/SubscriptionSync";
import { FreePostsBanner } from "@/components/dashboard/FreePostsBanner";
import { ConnectAccountsBanner } from "@/components/dashboard/ConnectAccountsBanner";
import { TeamInviteBanners } from "@/components/dashboard/TeamInviteBanners";
import { PersonalWorkspaceBoot } from "@/components/dashboard/PersonalWorkspaceBoot";
import { LegalConsentGate } from "@/components/auth/LegalConsentGate";
import { useSessionResolved } from "@/lib/use-is-guest";
import { signInUrl } from "@/lib/sign-in-url";
import { rpc } from "@/lib/rpc";
import { getOnboardingStatus, type OnboardingStatus } from "@/api/onboarding";

function getPlanLabel(tier: string): string {
  if (tier === "max") return "Max plan";
  if (tier === "pro") return "Pro plan";
  if (tier === "growth") return "Growth plan";
  if (tier === "starter") return "Starter (Lite) plan";
  return "Free plan";
}

export function DashboardLayout() {
  const { session, isPending } = useSessionResolved();
  const location = useLocation();
  const navigate = useNavigate();
  const posthog = usePostHog();

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      const returnTo = `${location.pathname}${location.search}`;
      navigate(signInUrl(returnTo), { replace: true });
    }
  }, [isPending, session, location.pathname, location.search, navigate]);

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

  const relativePath = location.pathname
    .replace(/^\/dashboard\/teams\/[^/]+\/?/, "")
    .replace(/^\/dashboard\/?/, "");
  const onConnectionsPage =
    relativePath === "connections" ||
    relativePath.startsWith("connections/");
  const showConnectBanner =
    onboarding != null &&
    onboarding.connectedAccountsCount === 0 &&
    !onConnectionsPage;

  if (isPending || !session) {
    return null;
  }

  const sidebarUser = layoutData
    ? {
        ...session.user,
        name: layoutData.profileName ?? session.user.name,
        image: layoutData.profileImage ?? session.user.image,
      }
    : session.user;

  return (
    <div className="dashboard-shell flex h-screen overflow-hidden bg-bg">
      <SeoHead
        {...dashboardSeo}
        path={location.pathname}
      />
      {session && layoutData?.subscriptionTier && (
        <SubscriptionSync tier={layoutData.subscriptionTier} />
      )}
      <DashboardSidebar
        user={sidebarUser}
        planLabel={
          layoutData ? getPlanLabel(layoutData.subscriptionTier) : "…"
        }
        sessionPending={isPending}
      />
      <PersonalWorkspaceBoot enabled />
      <main
        data-dashboard-main
        className="flex flex-1 flex-col min-h-0 overflow-y-auto pb-80 mb-20 lg:mb-0 lg:pb-0"
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] 2xl:max-w-7xl flex-1 flex-col px-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-12 sm:pl-4 sm:pr-6 sm:pt-6 sm:pb-6 lg:px-8 lg:py-8 lg:pb-8">
          <TeamInviteBanners />
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
      <LegalConsentGate />
    </div>
  );
}

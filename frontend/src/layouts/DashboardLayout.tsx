import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { usePostHog } from "@posthog/react";
import { SeoHead } from "@/components/seo/SeoHead";
import { dashboardSeo } from "@/lib/page-metadata";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardShellSkeleton } from "@/components/dashboard/DashboardShellSkeleton";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { SubscriptionSync } from "@/components/dashboard/SubscriptionSync";
import { TeamInviteBanners } from "@/components/dashboard/TeamInviteBanners";
import { ReconnectBanner } from "@/components/dashboard/ReconnectBanner";
import { MobileTopBar } from "@/components/dashboard/MobileTopBar";
import { DashboardHotkeys } from "@/components/dashboard/DashboardHotkeys";
import { ComposerHost, SkeletonPageHeader, SkeletonRows, isComposerPagePath } from "@/components/app";
import { PublishTray } from "@/features/dashboard/publish/PublishTray";
import { getDashboardRelativePath } from "@/lib/dashboard-base-path";
import { planName } from "@/lib/plan-name";
import { PersonalWorkspaceBoot } from "@/components/dashboard/PersonalWorkspaceBoot";
import { LegalConsentGate } from "@/components/auth/LegalConsentGate";
import { useSessionResolved } from "@/lib/use-is-guest";
import { signInUrl } from "@/lib/sign-in-url";
import { loadDashboardLayoutData } from "@/api/dashboard-data";
import { getOnboardingStatus, type OnboardingStatus } from "@/api/onboarding";
import { ONBOARDING_CONNECT_RETURN } from "@/features/onboarding/lib/paths";
import { SettingsMobileBar, SettingsSidebar } from "@/features/dashboard/settings/SettingsNav";
import { rememberAppPath } from "@/features/dashboard/settings/settings-workspace";

/**
 * OAuth account pickers (`connections/<network>/select`,
 * `connect/instagram-facebook/select`), personal or team scoped. Onboarding
 * connects go through them, so the onboarding gate lets them render.
 */
const ONBOARDING_SELECT_FLOW_RE =
  /^\/dashboard\/(?:teams\/[^/]+\/)?(?:connections\/[^/]+\/select|connect\/[^/]+\/select)\/?$/;

export function DashboardLayout() {
  const { session, isPending } = useSessionResolved();
  const location = useLocation();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const mainRef = useRef<HTMLElement>(null);
  const scrolledForPath = useRef<string | null>(null);

  // The shell is one viewport tall and `<main>` is the scroller, so
  // RootLayout's `window.scrollTo` never reaches it and `main` (which stays
  // mounted across pages) would carry the old offset into the next page.
  // Keyed on pathname only: tab / filter changes in `?search` keep the
  // position. Hash links and `keepScroll` navigations opt out, as in RootLayout.
  const keepScroll =
    (location.state as { keepScroll?: boolean } | null)?.keepScroll === true;
  useLayoutEffect(() => {
    if (scrolledForPath.current === location.pathname) return;
    scrolledForPath.current = location.pathname;
    if (location.hash || keepScroll) return;
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname, location.hash, keepScroll]);

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
    queryFn: loadDashboardLayoutData,
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
    if (!onboarding.shouldOnboard) return;
    // An OAuth round trip that failed (or finished) during onboarding lands
    // on /dashboard?error=… (which the index already forwarded to
    // /dashboard/connections?error=…): hand the result to the connect step so
    // it can say what happened, wherever in the dashboard it landed.
    const params = new URLSearchParams(location.search);
    const connectResult = params.has("error") || params.has("connected");
    // Only the OAuth account pickers stay reachable mid-onboarding; the
    // Accounts page itself is behind the gate like every other page.
    const isSelectFlow = ONBOARDING_SELECT_FLOW_RE.test(location.pathname);
    if (!connectResult && isSelectFlow) return;
    navigate(
      connectResult ? `${ONBOARDING_CONNECT_RETURN}${location.search}` : "/onboarding",
      { replace: true },
    );
  }, [session, onboarding, location.pathname, location.search, navigate]);

  // Alert tiers: only blocking problems get a page-top banner, and Home
  // shows the same item in "Needs attention" instead.
  const relativePath = getDashboardRelativePath(location.pathname);
  const onHome = relativePath === "home" || relativePath.startsWith("home/");
  // Phones: the full-page composer takes the whole screen (its header holds
  // the publish button and a close), so the mobile top bar and tab bar step aside.
  const onComposerPage = isComposerPagePath(relativePath);
  // Settings (personal or team) takes over the shell: a settings sidebar
  // with "Back to app" replaces the app sidebar, and a back + section picker
  // bar replaces the phone top bar. Every other page is remembered so Back
  // returns to it.
  const onSettings = relativePath.split("/")[0] === "settings";
  const appPath = onSettings ? null : `${location.pathname}${location.search}`;
  useEffect(() => {
    if (appPath) rememberAppPath(appPath);
  }, [appPath]);

  if (isPending || !session) {
    return <DashboardShellSkeleton />;
  }

  const sidebarUser = layoutData
    ? {
        ...session.user,
        name: layoutData.profileName ?? session.user.name,
        image: layoutData.profileImage ?? session.user.image,
      }
    : session.user;
  const layoutPending = !layoutData;

  return (
    <div className="dashboard-shell flex h-app-shell overflow-hidden bg-bg">
      <SeoHead
        {...dashboardSeo}
        path={location.pathname}
      />
      {session && layoutData?.subscriptionTier && (
        <SubscriptionSync tier={layoutData.subscriptionTier} />
      )}
      {onSettings ? (
        <SettingsSidebar />
      ) : (
        <DashboardSidebar
          user={sidebarUser}
          planTier={layoutData?.subscriptionTier ?? null}
          freePosts={layoutData?.freePostsBanner ?? null}
          sessionPending={isPending}
          layoutPending={layoutPending}
          canCreatePosts={layoutData?.canCreatePosts ?? false}
          canViewAnalytics={layoutData?.canViewAnalytics ?? false}
          canViewInbox={layoutData?.canViewInbox ?? false}
        />
      )}
      <PersonalWorkspaceBoot enabled />
      <main
        ref={mainRef}
        data-dashboard-main
        className="flex flex-1 flex-col min-h-0 overflow-y-auto"
      >
        {onComposerPage ? null : onSettings ? (
          <SettingsMobileBar />
        ) : (
          <MobileTopBar
            planName={layoutData ? planName(layoutData.subscriptionTier) : null}
            canCreatePosts={layoutData?.canCreatePosts ?? false}
            freePosts={layoutData?.freePostsBanner ?? null}
          />
        )}
        {/* `min-h-full`, NOT `h-full`. With a fixed height this box stops at
            the viewport and taller content overflows *past* its padding, so
            `pb-bottom-nav` cleared nothing and page content sat under the tab
            bar even scrolled to the end. `min-h-full` fills a short page and
            grows with a long one, so the padding always lands below the
            content.
            `shrink-0` is load-bearing, and `flex-1` is deliberately absent.
            As a normal flex item this box has flex-shrink: 1, so against a
            664px line it shrank from its real 1898px content height down to
            the `min-height: 100%` floor — which is exactly why the padding
            cleared nothing. Not shrinking + `min-h-full` gives both
            behaviours: fills a short page, grows with a long one. */}
        <div className="mx-auto flex min-h-full w-full max-w-[1200px] 2xl:max-w-7xl shrink-0 flex-col px-3 pt-4 pb-bottom-nav pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-4 sm:pr-6 sm:pt-6 lg:px-8 lg:py-8 lg:pb-8">
          {/* Settings pages sit in a 680px column: keep the shell banners on
              it instead of running past the page's right edge. */}
          <div className={onSettings ? "w-full max-w-[680px]" : "contents"}>
            <TeamInviteBanners />
            {!onHome ? <ReconnectBanner /> : null}
          </div>
          {/* Pages load lazily: keep the shell up while a page's code arrives. */}
          <Suspense
            fallback={
              <div aria-busy="true" aria-label="Loading page" className="space-y-5">
                <SkeletonPageHeader />
                <SkeletonRows rows={6} />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>
      {onComposerPage ? null : (
        <DashboardBottomNav
          canCreatePosts={layoutData?.canCreatePosts ?? true}
          canViewInbox={layoutData?.canViewInbox ?? true}
        />
      )}
      <DashboardHotkeys
        canCreatePosts={layoutData?.canCreatePosts ?? false}
        canViewInbox={layoutData?.canViewInbox ?? false}
        canViewAnalytics={layoutData?.canViewAnalytics ?? false}
      />
      <ComposerHost />
      {/* Publishes keep reporting here after the composer closes or the page changes. */}
      <PublishTray />
      <LegalConsentGate />
    </div>
  );
}

import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  Route,
  RouterProvider,
  Routes,
  useLocation,
  useRouteError,
} from "react-router-dom";
import { RootLayout } from "@/layouts/RootLayout";
import { HomePage } from "@/pages/HomePage";

const DashboardLayout = lazy(() =>
  import("@/layouts/DashboardLayout").then((m) => ({ default: m.DashboardLayout })),
);
const OnboardingLayout = lazy(() =>
  import("@/layouts/OnboardingLayout").then((m) => ({
    default: m.OnboardingLayout,
  })),
);

const AuthRoutePage = lazy(() =>
  import("@/pages/AuthRoutePage").then((m) => ({ default: m.AuthRoutePage })),
);
const ForgotPasswordPage = lazy(
  () => import("@/features/auth/pages/ForgotPasswordPage"),
);
const ResetPasswordPage = lazy(
  () => import("@/features/auth/pages/ResetPasswordPage"),
);
const VerifyEmailPage = lazy(
  () => import("@/features/auth/pages/VerifyEmailPage"),
);
const AuthContinuePage = lazy(
  () => import("@/features/auth/pages/AuthContinuePage"),
);

const ComposerPage = lazy(() =>
  import("@/pages/ComposerPage").then((m) => ({ default: m.ComposerPage })),
);
const PostsPage = lazy(() =>
  import("@/features/dashboard/posts/PostsPage").then((m) => ({
    default: m.PostsPage,
  })),
);
const BillingPage = lazy(() =>
  import("@/features/dashboard/billing/BillingPage").then((m) => ({
    default: m.BillingPage,
  })),
);
const CalendarPage = lazy(() =>
  import("@/features/dashboard/calendar/CalendarPage").then((m) => ({
    default: m.CalendarPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import("@/features/dashboard/analytics/AnalyticsPage").then((m) => ({
    default: m.AnalyticsPage,
  })),
);
const InboxPage = lazy(() =>
  import("@/features/dashboard/inbox/InboxPage").then((m) => ({
    default: m.InboxPage,
  })),
);
const ConnectionsPage = lazy(() =>
  import("@/features/dashboard/connections/ConnectionsPage").then((m) => ({
    default: m.ConnectionsPage,
  })),
);
const FeedbackPageRoute = lazy(() =>
  import("@/features/dashboard/feedback/FeedbackPage").then((m) => ({
    default: m.FeedbackPage,
  })),
);
const CreateHubPage = lazy(() =>
  import("@/pages/CreateHubPage").then((m) => ({ default: m.CreateHubPage })),
);
const CreateTypePage = lazy(() =>
  import("@/pages/CreateTypePage").then((m) => ({ default: m.CreateTypePage })),
);
const PostDetailPage = lazy(() =>
  import("@/pages/PostDetailPage").then((m) => ({ default: m.PostDetailPage })),
);
const DashboardHomePage = lazy(() =>
  import("@/features/dashboard/home/HomePage").then((m) => ({
    default: m.HomePage,
  })),
);
const NewPostPage = lazy(() =>
  import("@/features/dashboard/create/NewPostPage").then((m) => ({
    default: m.NewPostPage,
  })),
);
const AutomationsPage = lazy(() =>
  import("@/features/dashboard/automations/AutomationsPage").then((m) => ({
    default: m.AutomationsPage,
  })),
);
const AgentsPage = lazy(() =>
  import("@/features/dashboard/api-keys/AgentsPage").then((m) => ({
    default: m.AgentsPage,
  })),
);
const SettingsShell = lazy(() =>
  import("@/features/dashboard/settings/SettingsShell").then((m) => ({
    default: m.SettingsShell,
  })),
);
const MorePage = lazy(() =>
  import("@/pages/MorePage").then((m) => ({ default: m.MorePage })),
);
const BulkToolsPage = lazy(() =>
  import("@/pages/BulkToolsPages").then((m) => ({ default: m.BulkToolsPage })),
);
const BulkToolsImagePage = lazy(() =>
  import("@/pages/BulkToolsImagePage").then((m) => ({
    default: m.BulkToolsImagePage,
  })),
);
const BulkToolsVideoPage = lazy(() =>
  import("@/pages/BulkToolsVideoPage").then((m) => ({
    default: m.BulkToolsVideoPage,
  })),
);
const DashboardRedirect = lazy(() =>
  import("@/pages/DashboardRedirect").then((m) => ({
    default: m.DashboardRedirect,
  })),
);
const EditPostRedirect = lazy(() =>
  import("@/pages/DashboardRedirect").then((m) => ({
    default: m.EditPostRedirect,
  })),
);
const DashboardIndexRedirect = lazy(() =>
  import("@/pages/DashboardRedirect").then((m) => ({
    default: m.DashboardIndexRedirect,
  })),
);
const TeamsPage = lazy(() =>
  import("@/features/dashboard/teams/TeamsPage").then((m) => ({
    default: m.TeamsPage,
  })),
);
const WorkspacesPage = lazy(() =>
  import("@/features/dashboard/workspaces/WorkspacesPage").then((m) => ({
    default: m.WorkspacesPage,
  })),
);
const CreateTeamPage = lazy(() =>
  import("@/features/dashboard/teams/CreateTeamPage").then((m) => ({
    default: m.CreateTeamPage,
  })),
);
const TeamAppLayout = lazy(() =>
  import("@/layouts/TeamAppLayout").then((m) => ({ default: m.TeamAppLayout })),
);
const AcceptInvitePage = lazy(() =>
  import("@/pages/AcceptInvitePage").then((m) => ({
    default: m.AcceptInvitePage,
  })),
);

const TermsPage = lazy(() => import("@/features/marketing/pages/TermsPage"));
const PrivacyPage = lazy(() => import("@/features/marketing/pages/PrivacyPage"));
const RefundPage = lazy(() => import("@/features/marketing/pages/RefundPage"));
const DataDeletionPage = lazy(
  () => import("@/features/marketing/pages/DataDeletionPage"),
);
const FeaturesIndexPage = lazy(
  () => import("@/features/marketing/pages/FeaturesIndexPage"),
);
const AlternativesIndexPage = lazy(
  () => import("@/features/marketing/pages/AlternativesIndexPage"),
);
const FeatureDetailPage = lazy(() =>
  import("@/pages/FeatureDetailPage").then((m) => ({
    default: m.FeatureDetailPage,
  })),
);
const AlternativeDetailPage = lazy(() =>
  import("@/pages/AlternativeDetailPage").then((m) => ({
    default: m.AlternativeDetailPage,
  })),
);
const AlternativeToRedirect = lazy(() =>
  import("@/pages/PseoRedirectPages").then((m) => ({
    default: m.AlternativeToRedirect,
  })),
);
const FeatureRootRedirect = lazy(() =>
  import("@/pages/PseoRedirectPages").then((m) => ({
    default: m.FeatureRootRedirect,
  })),
);
const HomeMarketingPage = lazy(() =>
  import("@/pages/HomeMarketingPage").then((m) => ({
    default: m.HomeMarketingPage,
  })),
);
const McpPage = lazy(() => import("@/features/marketing/pages/McpPage"));
const FreeToolsIndexPage = lazy(() => import("@/features/marketing/pages/FreeToolsIndexPage"));
const PostPreviewToolPage = lazy(() => import("@/features/marketing/pages/PostPreviewToolPage"));
const LinkedInFormatterPage = lazy(() => import("@/features/marketing/pages/LinkedInFormatterPage"));
const ImageResizerPage = lazy(() => import("@/features/marketing/pages/ImageResizerPage"));
const PricingPage = lazy(() => import("@/features/marketing/pages/PricingPage"));
const AboutPage = lazy(() => import("@/features/marketing/pages/AboutPage"));
const ContactPage = lazy(() => import("@/features/marketing/pages/ContactPage"));
const DevelopersPage = lazy(
  () => import("@/features/marketing/pages/DevelopersPage"),
);
const ToolsIndexPage = lazy(
  () => import("@/features/marketing/pages/ToolsIndexPage"),
);
const BlogIndexPage = lazy(
  () => import("@/features/marketing/pages/BlogIndexPage"),
);
const BlogPostPage = lazy(() =>
  import("@/pages/BlogPostPage").then((m) => ({
    default: m.BlogPostPage,
  })),
);
const ToolDetailPage = lazy(() =>
  import("@/pages/ToolDetailPage").then((m) => ({
    default: m.ToolDetailPage,
  })),
);

const OnboardingWelcomePage = lazy(
  () => import("@/features/onboarding/pages/OnboardingWelcomePage"),
);
const OnboardingConnectPage = lazy(
  () => import("@/features/onboarding/pages/OnboardingConnectPage"),
);
const OnboardingPlanPage = lazy(
  () => import("@/features/onboarding/pages/OnboardingPlanPage"),
);
const OnboardingReadyPage = lazy(
  () => import("@/features/onboarding/pages/OnboardingReadyPage"),
);
const FacebookSelectPage = lazy(
  () => import("@/features/dashboard/connections/pages/FacebookSelectPage"),
);
const InstagramSelectPage = lazy(
  () => import("@/features/dashboard/connections/pages/InstagramSelectPage"),
);
const LinkedinSelectPage = lazy(
  () => import("@/features/dashboard/connections/pages/LinkedinSelectPage"),
);
const ConnectInstagramFacebookSelectPage = lazy(
  () =>
    import(
      "@/features/dashboard/connections/pages/InstagramFacebookSelectPage"
    ),
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);
const McpOAuthConnectPage = lazy(
  () => import("@/features/oauth/pages/McpOAuthConnectPage"),
);

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-background">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
        aria-label="Loading"
      />
    </div>
  );
}

/** `/alternative-to-buffer` (trailing slash ok). Kept here so the router
 *  doesn't pull the lazily loaded redirect module into the main chunk. */
const ALTERNATIVE_TO_PATH = /^\/alternative-to-[^/]+\/?$/;

function CatchAllRoute() {
  const { pathname } = useLocation();
  return (
    <Lazy>
      {ALTERNATIVE_TO_PATH.test(pathname) ? <AlternativeToRedirect /> : <NotFoundPage />}
    </Lazy>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

/**
 * Pages that exist in both the personal tree (/dashboard/*) and each team
 * tree (/dashboard/teams/:teamId/*). Account-level pages (billing,
 * settings, feedback, teams, workspaces) are registered separately.
 */
function workspaceRoutes() {
  return (
    <>
      <Route path="home" element={<DashboardHomePage />} />
      <Route path="new" element={<NewPostPage />} />
      {/* Old composer entry points render the same one-screen composer and
          keep ?edit= / ?draft= / ?scheduled= / fromComposer. */}
      <Route path="composer" element={<ComposerPage />} />
      <Route path="create" element={<CreateHubPage />} />
      <Route path="create/:type" element={<CreateTypePage />} />
      <Route path="posts" element={<PostsPage />} />
      <Route
        path="posts/drafts"
        element={<DashboardRedirect to="posts?tab=drafts" />}
      />
      <Route
        path="posts/scheduled"
        element={<DashboardRedirect to="posts?tab=scheduled" />}
      />
      <Route
        path="posts/posted"
        element={<DashboardRedirect to="posts?tab=published" />}
      />
      <Route path="posts/:id" element={<PostDetailPage />} />
      {/* The old edit page is gone; old links open the composer in edit mode. */}
      <Route path="posts/:id/edit" element={<EditPostRedirect />} />
      <Route path="calendar" element={<CalendarPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="inbox" element={<InboxPage />} />
      <Route path="automations" element={<AutomationsPage />} />
      <Route path="agents" element={<AgentsPage />} />
      <Route path="more" element={<MorePage />} />
      <Route path="connections" element={<ConnectionsPage />} />
      <Route
        path="connections/facebook/select"
        element={<FacebookSelectPage />}
      />
      <Route
        path="connections/instagram/select"
        element={<InstagramSelectPage />}
      />
      <Route
        path="connections/linkedin/select"
        element={<LinkedinSelectPage />}
      />
      <Route
        path="connect/instagram-facebook/select"
        element={<ConnectInstagramFacebookSelectPage />}
      />
      <Route path="bulk-tools" element={<BulkToolsPage />} />
      <Route path="bulk-tools/image" element={<BulkToolsImagePage />} />
      <Route path="bulk-tools/video" element={<BulkToolsVideoPage />} />
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="auth"
          element={
            <Lazy>
              <AuthRoutePage />
            </Lazy>
          }
        />
        <Route
          path="auth/forgot-password"
          element={
            <Lazy>
              <ForgotPasswordPage />
            </Lazy>
          }
        />
        <Route
          path="auth/reset-password"
          element={
            <Lazy>
              <ResetPasswordPage />
            </Lazy>
          }
        />
        <Route
          path="auth/verify-email"
          element={
            <Lazy>
              <VerifyEmailPage />
            </Lazy>
          }
        />
        <Route
          path="auth/continue"
          element={
            <Lazy>
              <AuthContinuePage />
            </Lazy>
          }
        />
        <Route
          path="terms"
          element={
            <Lazy>
              <TermsPage />
            </Lazy>
          }
        />
        <Route
          path="privacy"
          element={
            <Lazy>
              <PrivacyPage />
            </Lazy>
          }
        />
        <Route
          path="refund"
          element={
            <Lazy>
              <RefundPage />
            </Lazy>
          }
        />
        <Route
          path="data-deletion"
          element={
            <Lazy>
              <DataDeletionPage />
            </Lazy>
          }
        />
        <Route
          path="features"
          element={
            <Lazy>
              <FeaturesIndexPage />
            </Lazy>
          }
        />
        <Route
          path="features/:slug"
          element={
            <Lazy>
              <FeatureDetailPage />
            </Lazy>
          }
        />
        <Route
          path="alternatives"
          element={
            <Lazy>
              <AlternativesIndexPage />
            </Lazy>
          }
        />
        <Route
          path="alternatives/:slug"
          element={
            <Lazy>
              <AlternativeDetailPage />
            </Lazy>
          }
        />
        {[
          "social-media-scheduler",
          "bluesky-scheduler",
          "x-scheduler",
          "twitter-scheduler",
          "instagram-scheduler",
          "linkedin-scheduler",
          "tiktok-scheduler",
          "youtube-scheduler",
          "pinterest-scheduler",
          "facebook-scheduler",
          "threads-scheduler",
          "social-media-calendar",
        ].map((slug) => (
          <Route
            key={slug}
            path={slug}
            element={
              <Lazy>
                <FeatureRootRedirect />
              </Lazy>
            }
          />
        ))}
        <Route
          path="home"
          element={
            <Lazy>
              <HomeMarketingPage />
            </Lazy>
          }
        />
        <Route
          path="mcp"
          element={
            <Lazy>
              <McpPage />
            </Lazy>
          }
        />
        <Route
          path="free-tools"
          element={
            <Lazy>
              <FreeToolsIndexPage />
            </Lazy>
          }
        />
        <Route
          path="free-tools/image-resizer"
          element={
            <Lazy>
              <ImageResizerPage />
            </Lazy>
          }
        />
        <Route
          path="free-tools/image-resizer/:platform"
          element={
            <Lazy>
              <ImageResizerPage />
            </Lazy>
          }
        />
        <Route
          path="free-tools/linkedin-text-formatter"
          element={
            <Lazy>
              <LinkedInFormatterPage />
            </Lazy>
          }
        />
        <Route
          path="free-tools/post-preview/:platform"
          element={
            <Lazy>
              <PostPreviewToolPage />
            </Lazy>
          }
        />
        <Route
          path="tools"
          element={
            <Lazy>
              <ToolsIndexPage />
            </Lazy>
          }
        />
        <Route
          path="tools/:slug"
          element={
            <Lazy>
              <ToolDetailPage />
            </Lazy>
          }
        />
        <Route
          path="blog"
          element={
            <Lazy>
              <BlogIndexPage />
            </Lazy>
          }
        />
        <Route
          path="blog/:slug"
          element={
            <Lazy>
              <BlogPostPage />
            </Lazy>
          }
        />
        <Route
          path="pricing"
          element={
            <Lazy>
              <PricingPage />
            </Lazy>
          }
        />
        <Route
          path="about"
          element={
            <Lazy>
              <AboutPage />
            </Lazy>
          }
        />
        <Route
          path="contact"
          element={
            <Lazy>
              <ContactPage />
            </Lazy>
          }
        />
        <Route
          path="developers"
          element={
            <Lazy>
              <DevelopersPage />
            </Lazy>
          }
        />
        <Route
          path="oauth/mcp/connect"
          element={
            <Lazy>
              <McpOAuthConnectPage />
            </Lazy>
          }
        />
        <Route
          path="invite/:token"
          element={
            <Lazy>
              <AcceptInvitePage />
            </Lazy>
          }
        />

        <Route
          path="onboarding"
          element={
            <Lazy>
              <OnboardingLayout />
            </Lazy>
          }
        >
          <Route index element={<OnboardingWelcomePage />} />
          <Route path="step2" element={<OnboardingConnectPage />} />
          <Route path="step3" element={<OnboardingPlanPage />} />
          <Route path="step4" element={<OnboardingReadyPage />} />
        </Route>

        <Route
          path="dashboard"
          element={
            <Lazy>
              <DashboardLayout />
            </Lazy>
          }
        >
          <Route index element={<DashboardIndexRedirect />} />
          {workspaceRoutes()}
          <Route path="billing" element={<BillingPage />} />
          <Route path="settings" element={<SettingsShell />} />
          <Route path="settings/:section" element={<SettingsShell />} />
          <Route
            path="api-keys"
            element={<DashboardRedirect to="agents?tab=keys" />}
          />
          <Route path="feedback/*" element={<FeedbackPageRoute />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="teams/create" element={<CreateTeamPage />} />
          <Route
            path="teams/:teamId"
            element={
              <Lazy>
                <TeamAppLayout />
              </Lazy>
            }
          >
            <Route index element={<DashboardIndexRedirect />} />
            {workspaceRoutes()}
            {/* Team settings sit behind the same gate, so the team's
                workspace is active before the shell (composer, sidebar
                accounts) reads it. */}
            <Route path="settings" element={<SettingsShell />} />
            <Route path="settings/:section" element={<SettingsShell />} />
          </Route>
        </Route>

        {/* Also serves /alternative-to-:slug: React Router can't match a
            param in the middle of a segment. */}
        <Route path="*" element={<CatchAllRoute />} />
      </Route>
    </Routes>
  );
}

/** Render errors keep going past the router, as they did under BrowserRouter. */
function RethrowRouteError(): never {
  throw useRouteError();
}

// A data router so pages can use `useBlocker` (the composer asks before
// unsaved changes are dropped). Every route is still declared in AppRoutes,
// under one splat route.
const router = createBrowserRouter([
  { path: "*", element: <AppRoutes />, errorElement: <RethrowRouteError /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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

const ComposerPage = lazy(() =>
  import("@/pages/ComposerPage").then((m) => ({ default: m.ComposerPage })),
);
const PostsPage = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({ default: m.PostsPage })),
);
const BillingPage = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({ default: m.BillingPage })),
);
const CalendarPage = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({ default: m.CalendarPage })),
);
const ConnectionsPage = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({
    default: m.ConnectionsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({ default: m.SettingsPage })),
);
const FeedbackPageRoute = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({
    default: m.FeedbackPageRoute,
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
const EditPostPage = lazy(() =>
  import("@/pages/EditPostPage").then((m) => ({ default: m.EditPostPage })),
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
const DraftsPostsPage = lazy(() =>
  import("@/pages/StatusPostsPage").then((m) => ({
    default: m.DraftsPostsPage,
  })),
);
const ScheduledPostsPage = lazy(() =>
  import("@/pages/StatusPostsPage").then((m) => ({
    default: m.ScheduledPostsPage,
  })),
);
const PostedPostsPage = lazy(() =>
  import("@/pages/StatusPostsPage").then((m) => ({
    default: m.PostedPostsPage,
  })),
);
const ApiKeysPage = lazy(() =>
  import("@/pages/ApiKeysPage").then((m) => ({ default: m.ApiKeysPage })),
);
const TeamsPage = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({ default: m.TeamsPage })),
);
const WorkspacesPage = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({ default: m.WorkspacesPage })),
);
const CreateTeamPage = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({ default: m.CreateTeamPage })),
);
const TeamDetailPage = lazy(() =>
  import("@/pages/DashboardPages").then((m) => ({ default: m.TeamDetailPage })),
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
const HomeMarketingPage = lazy(() =>
  import("@/pages/HomeMarketingPage").then((m) => ({
    default: m.HomeMarketingPage,
  })),
);
const McpPage = lazy(() => import("@/features/marketing/pages/McpPage"));

const OnboardingPage = lazy(
  () => import("@/features/onboarding/pages/OnboardingStep2Page"),
);
const OnboardingStep2Page = lazy(
  () => import("@/features/onboarding/pages/OnboardingStep1Page"),
);
const OnboardingStep3Page = lazy(
  () => import("@/features/onboarding/pages/OnboardingStep3Page"),
);
const OnboardingStep4Page = lazy(
  () => import("@/features/onboarding/pages/OnboardingStep4Page"),
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

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
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
            <Route index element={<OnboardingPage />} />
            <Route path="step2" element={<OnboardingStep2Page />} />
            <Route path="step3" element={<OnboardingStep3Page />} />
            <Route path="step4" element={<OnboardingStep4Page />} />
          </Route>

          <Route
            path="dashboard"
            element={
              <Lazy>
                <DashboardLayout />
              </Lazy>
            }
          >
            <Route
              index
              element={<Navigate to="/dashboard/composer" replace />}
            />
            <Route path="composer" element={<ComposerPage />} />
            <Route path="create" element={<CreateHubPage />} />
            <Route path="create/:type" element={<CreateTypePage />} />
            <Route path="posts" element={<PostsPage />} />
            <Route path="posts/drafts" element={<DraftsPostsPage />} />
            <Route path="posts/scheduled" element={<ScheduledPostsPage />} />
            <Route path="posts/posted" element={<PostedPostsPage />} />
            <Route path="posts/:id" element={<PostDetailPage />} />
            <Route path="posts/:id/edit" element={<EditPostPage />} />
            <Route path="calendar" element={<CalendarPage />} />
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
            <Route path="billing" element={<BillingPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="bulk-tools" element={<BulkToolsPage />} />
            <Route path="bulk-tools/image" element={<BulkToolsImagePage />} />
            <Route path="bulk-tools/video" element={<BulkToolsVideoPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="feedback/*" element={<FeedbackPageRoute />} />
            <Route path="more" element={<MorePage />} />
            <Route path="workspaces" element={<WorkspacesPage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="teams/create" element={<CreateTeamPage />} />
            <Route
              path="teams/:teamId/settings"
              element={<TeamDetailPage />}
            />
            <Route
              path="teams/:teamId"
              element={
                <Lazy>
                  <TeamAppLayout />
                </Lazy>
              }
            >
              <Route
                index
                element={<Navigate to="composer" replace />}
              />
              <Route path="composer" element={<ComposerPage />} />
              <Route path="create" element={<CreateHubPage />} />
              <Route path="create/:type" element={<CreateTypePage />} />
              <Route path="posts" element={<PostsPage />} />
              <Route path="posts/drafts" element={<DraftsPostsPage />} />
              <Route path="posts/scheduled" element={<ScheduledPostsPage />} />
              <Route path="posts/posted" element={<PostedPostsPage />} />
              <Route path="posts/:id" element={<PostDetailPage />} />
              <Route path="posts/:id/edit" element={<EditPostPage />} />
              <Route path="calendar" element={<CalendarPage />} />
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
            </Route>
          </Route>

          <Route
            path="*"
            element={
              <Lazy>
                <NotFoundPage />
              </Lazy>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

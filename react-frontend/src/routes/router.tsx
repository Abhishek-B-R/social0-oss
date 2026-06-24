import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RootLayout } from "@/layouts/RootLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { OnboardingLayout } from "@/layouts/OnboardingLayout";
import { HomePage } from "@/pages/HomePage";
import { AuthRoutePage } from "@/pages/AuthRoutePage";
import {
  ForgotPasswordRoutePage,
  ResetPasswordRoutePage,
  VerifyEmailRoutePage,
} from "@/pages/AuthSubPages";
import { ComposerPage } from "@/pages/ComposerPage";
import {
  DashboardIndexPage,
  PostsPage,
  BillingPage,
  CalendarPage,
  ConnectionsPage,
  SettingsPage,
} from "@/pages/DashboardPages";
import { CreateHubPage } from "@/pages/CreateHubPage";
import { CreateTypePage } from "@/pages/CreateTypePage";
import { PostDetailPage } from "@/pages/PostDetailPage";
import { EditPostPage } from "@/pages/EditPostPage";
import { FeedbackPage } from "@/pages/FeedbackPage";
import { MorePage } from "@/pages/MorePage";
import { BulkToolsPage } from "@/pages/BulkToolsPages";
import { BulkToolsImagePage } from "@/pages/BulkToolsImagePage";
import { BulkToolsVideoPage } from "@/pages/BulkToolsVideoPage";
import {
  DraftsPostsPage,
  ScheduledPostsPage,
  PostedPostsPage,
} from "@/pages/StatusPostsPage";
import { ApiKeysPage } from "@/pages/ApiKeysPage";
import { TeamsPage } from "@/pages/TeamsPage";
import { MarketingPages } from "@/pages/MarketingPages";
import OnboardingPage from "@/features/onboarding/pages/OnboardingStep1Page";
import OnboardingStep2Page from "@/features/onboarding/pages/OnboardingStep2Page";
import OnboardingStep3Page from "@/features/onboarding/pages/OnboardingStep3Page";
import OnboardingStep4Page from "@/features/onboarding/pages/OnboardingStep4Page";
import FacebookSelectPage from "@/features/dashboard/connections/pages/FacebookSelectPage";
import InstagramSelectPage from "@/features/dashboard/connections/pages/InstagramSelectPage";
import LinkedinSelectPage from "@/features/dashboard/connections/pages/LinkedinSelectPage";
import ConnectInstagramFacebookSelectPage from "@/features/dashboard/connections/pages/InstagramFacebookSelectPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<HomePage />} />
          <Route path="auth" element={<AuthRoutePage />} />
          <Route path="auth/forgot-password" element={<ForgotPasswordRoutePage />} />
          <Route path="auth/reset-password" element={<ResetPasswordRoutePage />} />
          <Route path="auth/verify-email" element={<VerifyEmailRoutePage />} />
          <Route path="terms" element={<MarketingPages.Terms />} />
          <Route path="privacy" element={<MarketingPages.Privacy />} />
          <Route path="data-deletion" element={<MarketingPages.DataDeletion />} />
          <Route path="features" element={<MarketingPages.FeaturesIndex />} />
          <Route path="features/:slug" element={<MarketingPages.FeatureDetail />} />
          <Route path="alternatives" element={<MarketingPages.AlternativesIndex />} />
          <Route path="alternatives/:slug" element={<MarketingPages.AlternativeDetail />} />
          <Route path="home" element={<MarketingPages.Home />} />

          <Route path="onboarding" element={<OnboardingLayout />}>
            <Route index element={<OnboardingPage />} />
            <Route path="step2" element={<OnboardingStep2Page />} />
            <Route path="step3" element={<OnboardingStep3Page />} />
            <Route path="step4" element={<OnboardingStep4Page />} />
          </Route>

          <Route path="dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardIndexPage />} />
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
            <Route path="connections/facebook/select" element={<FacebookSelectPage />} />
            <Route path="connections/instagram/select" element={<InstagramSelectPage />} />
            <Route path="connections/linkedin/select" element={<LinkedinSelectPage />} />
            <Route path="connect/instagram-facebook/select" element={<ConnectInstagramFacebookSelectPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="bulk-tools" element={<BulkToolsPage />} />
            <Route path="bulk-tools/image" element={<BulkToolsImagePage />} />
            <Route path="bulk-tools/video" element={<BulkToolsVideoPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="feedback" element={<FeedbackPage />} />
            <Route path="more" element={<MorePage />} />
            <Route path="teams" element={<TeamsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

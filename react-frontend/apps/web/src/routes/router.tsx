import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AuthPage } from "@/features/auth/auth-page";
import { BillingPage } from "@/features/billing/billing-page";
import {
  CalendarPage,
  CreateHubPage,
  PostsPage,
  SettingsPage,
} from "@/features/calendar/calendar-page";
import { ComposerPage } from "@/features/composer/composer-page";
import { ConnectionsPage } from "@/features/connections/connections-page";
import { LandingPage } from "@/pages/landing-page";

const rootRoute = createRootRoute();

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: AuthPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardLayout,
});

const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/composer" });
  },
});

const composerRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "composer",
  component: ComposerPage,
});

const createRoute_ = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "create",
  component: CreateHubPage,
});

const createTypeRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "create/$type",
  component: () => (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Create post</h1>
      <p className="text-text-muted">Port TextPostForm / ImagePostForm / etc. here.</p>
    </div>
  ),
});

const postsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "posts",
  component: PostsPage,
});

const postsDraftsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "posts/drafts",
  component: PostsPage,
});

const postsScheduledRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "posts/scheduled",
  component: PostsPage,
});

const postsPostedRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "posts/posted",
  component: PostsPage,
});

const calendarRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "calendar",
  component: CalendarPage,
});

const connectionsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "connections",
  component: ConnectionsPage,
});

const billingRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "billing",
  component: BillingPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  dashboardRoute.addChildren([
    dashboardIndexRoute,
    composerRoute,
    createRoute_,
    createTypeRoute,
    postsRoute,
    postsDraftsRoute,
    postsScheduledRoute,
    postsPostedRoute,
    calendarRoute,
    connectionsRoute,
    billingRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

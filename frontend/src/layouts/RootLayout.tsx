import { useEffect, useLayoutEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { Toaster } from "sonner";
import { useSession } from "@/lib/auth-client";
import { usePostHog } from "@posthog/react";
import { sanitizeAnalyticsUrl } from "@/lib/sanitize-analytics-url";

export function RootLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const posthog = usePostHog();

  // Client-side navigations keep window scroll; reset to top unless a hash targets a section.
  useLayoutEffect(() => {
    if (location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!posthog?.__loaded) return;
    posthog.capture("$pageview", {
      $current_url: sanitizeAnalyticsUrl(window.location.href),
    });
  }, [location, posthog]);

  return (
    <ThemeProvider>
      <RouteSeo />
      <Outlet context={{ session, navigate }} />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );
}

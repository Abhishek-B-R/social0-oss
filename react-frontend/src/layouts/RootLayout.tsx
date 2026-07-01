import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { Toaster } from "sonner";
import { useSession } from "@/lib/auth-client";
import { usePostHog } from "@posthog/react";

export function RootLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const posthog = usePostHog();

  useEffect(() => {
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [location, posthog]);

  return (
    <ThemeProvider>
      <RouteSeo />
      <Outlet context={{ session, navigate }} />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );
}

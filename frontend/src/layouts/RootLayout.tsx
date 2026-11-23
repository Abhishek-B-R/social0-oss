import { useEffect, useLayoutEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { PostHogAnalytics } from "@/components/PostHogAnalytics";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";
import { useSession } from "@/lib/auth-client";
import { identifyVemetricUser } from "@/lib/vemetric";

export function RootLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  // Client-side navigations keep window scroll; reset to top unless a hash
  // targets a section or the navigation only swaps in-page state (landing
  // mode toggle passes `state: { keepScroll: true }`).
  const keepScroll =
    (location.state as { keepScroll?: boolean } | null)?.keepScroll === true;
  useLayoutEffect(() => {
    if (location.hash || keepScroll) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname, location.search, location.hash, keepScroll]);

  useEffect(() => {
    const user = session?.user;
    const id = user?.id?.trim();
    if (!user || !id) return;
    void identifyVemetricUser({
      id,
      displayName: user.name ?? user.email ?? null,
      avatarUrl: user.image ?? null,
    });
  }, [session]);

  return (
    <PostHogAnalytics>
      <ThemeProvider>
        <RouteSeo />
        <Outlet context={{ session, navigate }} />
        <AppToaster />
      </ThemeProvider>
    </PostHogAnalytics>
  );
}

/**
 * Sonner defaults to its light theme, so without this every plain toast was
 * a white card on the dark dashboard. Must render inside ThemeProvider.
 */
function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-center"
      richColors
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}

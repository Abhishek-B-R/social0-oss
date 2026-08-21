import { useEffect, useLayoutEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { PostHogAnalytics } from "@/components/PostHogAnalytics";
import { Toaster } from "sonner";
import { useSession } from "@/lib/auth-client";
import { identifyVemetricUser } from "@/lib/vemetric";

export function RootLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  // Client-side navigations keep window scroll; reset to top unless a hash targets a section.
  useLayoutEffect(() => {
    if (location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname, location.search, location.hash]);

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
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </PostHogAnalytics>
  );
}

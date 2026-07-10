import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouter } from "@/routes/router";
import posthog from "posthog-js";
import { PostHogProvider } from "@posthog/react";
import { syncAppBuild, registerStaleAssetRecovery } from "@/lib/app-build-sync";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@/index.css";

registerStaleAssetRecovery();

if (syncAppBuild()) {
  const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  const posthogHost =
    import.meta.env.VITE_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

  if (posthogToken) {
    posthog.init(posthogToken, {
      api_host: posthogHost,
      defaults: "2026-01-30",
      // Keep the production project clean — local traffic stays in Activity only if you opt in.
      loaded: (ph) => {
        const host = window.location.hostname;
        if (host === "localhost" || host === "127.0.0.1") {
          ph.opt_out_capturing();
        }
      },
    });
  } else if (import.meta.env.PROD) {
    console.warn(
      "[posthog] VITE_PUBLIC_POSTHOG_PROJECT_TOKEN missing at build time — analytics disabled",
    );
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <PostHogProvider client={posthog}>
        <HelmetProvider>
          <QueryClientProvider client={queryClient}>
            <AppRouter />
          </QueryClientProvider>
        </HelmetProvider>
      </PostHogProvider>
    </StrictMode>,
  );
}

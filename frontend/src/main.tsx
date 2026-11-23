import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouter } from "@/routes/router";
import { VemetricAnalytics } from "@/components/VemetricAnalytics";
import { syncAppBuild, registerStaleAssetRecovery } from "@/lib/app-build-sync";
import { installMobileViewportListener } from "@/lib/mobile-viewport";
import "@/index.css";

registerStaleAssetRecovery();

// Publishes --vv-height / --kb-inset before first paint so fixed bottom
// affordances are never laid out behind the mobile keyboard. DOM-level and
// idempotent, so it lives here rather than in a component effect.
installMobileViewportListener();

if (syncAppBuild()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        // Avoid workspace/auth UI thrash when alt-tabbing back to the dashboard.
        refetchOnWindowFocus: false,
      },
    },
  });

  const rootEl = document.getElementById("root")!;
  const app = (
    <StrictMode>
      <VemetricAnalytics />
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <AppRouter />
        </QueryClientProvider>
      </HelmetProvider>
    </StrictMode>
  );
  // "/" arrives with the landing page already rendered (functions/_middleware.ts
  // + scripts/prerender-landing.mjs): hydrate it so the painted hero stays.
  if (rootEl.dataset.ssr === "landing" && window.location.pathname === "/") {
    hydrateRoot(rootEl, app);
  } else {
    createRoot(rootEl).render(app);
  }
}

/**
 * Build-time render of "/" (scripts/prerender-landing.mjs). The markup must
 * match what the client renders for "/" on first pass (RootLayout + HomePage
 * while the session is still pending), because main.tsx hydrates it instead
 * of replacing it. A mismatch is not fatal: React falls back to a client render.
 */
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RootLayout } from "@/layouts/RootLayout";
import { HomePage } from "@/pages/HomePage";

export function renderLanding(): string {
  const queryClient = new QueryClient();
  return renderToString(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<RootLayout />}>
              <Route index element={<HomePage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

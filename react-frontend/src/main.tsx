import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouter } from "@/routes/router";
import { RouterRefreshProvider } from "@/lib/router-refresh";
import "@/index.css";

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
    <QueryClientProvider client={queryClient}>
      <RouterRefreshProvider>
        <AppRouter />
      </RouterRefreshProvider>
    </QueryClientProvider>
  </StrictMode>,
);

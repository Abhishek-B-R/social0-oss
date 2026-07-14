import {
  type ReactNode,
  useEffect,
  useState,
  createElement,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import { useLocation } from "react-router-dom";
import type { PostHog } from "posthog-js";
import { sanitizeAnalyticsUrl } from "@/lib/sanitize-analytics-url";

const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/auth",
  "/onboarding",
  "/settings",
  "/bulk-tools",
  "/mcp-oauth",
];

function shouldLoadPostHogEagerly(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function scheduleIdle(fn: () => void, timeoutMs: number) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(() => fn(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, Math.min(timeoutMs, 2500));
  return () => window.clearTimeout(id);
}

type PostHogProviderComponent = ComponentType<
  PropsWithChildren<{ client: PostHog }>
>;

/**
 * Loads PostHog off the critical path on marketing pages; loads sooner on app routes.
 * Also captures $pageview so RootLayout does not need a static @posthog/react import.
 */
export function PostHogAnalytics({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [client, setClient] = useState<PostHog | null>(null);
  const [Provider, setProvider] = useState<PostHogProviderComponent | null>(
    null,
  );

  useEffect(() => {
    const token = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
    if (!token) {
      if (import.meta.env.PROD) {
        console.warn(
          "[posthog] VITE_PUBLIC_POSTHOG_PROJECT_TOKEN missing at build time — analytics disabled",
        );
      }
      return;
    }

    let cancelled = false;
    let disposeIdle: (() => void) | undefined;

    const init = async () => {
      const [{ default: posthog }, react] = await Promise.all([
        import("posthog-js"),
        import("@posthog/react"),
      ]);
      if (cancelled) return;

      const host =
        import.meta.env.VITE_PUBLIC_POSTHOG_HOST?.trim() ||
        "https://us.i.posthog.com";

      posthog.init(token, {
        api_host: host,
        defaults: "2026-01-30",
        disable_session_recording: true,
        disable_surveys: true,
        loaded: (ph) => {
          const hostname = window.location.hostname;
          if (hostname === "localhost" || hostname === "127.0.0.1") {
            ph.opt_out_capturing();
          }
        },
      });

      if (cancelled) return;
      setProvider(() => react.PostHogProvider);
      setClient(posthog);
    };

    const start = () => {
      void init();
    };

    if (shouldLoadPostHogEagerly(window.location.pathname)) {
      start();
    } else {
      disposeIdle = scheduleIdle(start, 4000);
    }

    return () => {
      cancelled = true;
      disposeIdle?.();
    };
  }, []);

  useEffect(() => {
    if (!client?.__loaded) return;
    client.capture("$pageview", {
      $current_url: sanitizeAnalyticsUrl(window.location.href),
    });
  }, [location, client]);

  if (!client || !Provider) return children;
  return createElement(Provider, { client }, children);
}

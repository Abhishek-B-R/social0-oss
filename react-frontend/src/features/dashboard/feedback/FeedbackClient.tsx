"use client";

import DocsInfoIcon from "@/components/info-icon";
import { GuestSignInPrompt } from "@/components/dashboard/GuestSignInPrompt";
import { DOCS_FEEDBACK_URL } from "@/lib/docs-url";
import { getCannyBoardToken } from "@/lib/env";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

declare global {
  interface Window {
    Canny?: (method: string, options: Record<string, unknown>) => void;
  }
}

const CANNY_SDK_URL = "https://sdk.canny.io/sdk.js";
const CANNY_FALLBACK_URL = "https://social0.canny.io";

export function FeedbackClient() {
  const { resolvedTheme } = useTheme();
  const cannyTheme = resolvedTheme === "dark" ? "dark" : "light";

  const mountRef = useRef<HTMLDivElement>(null);
  const [ssoToken, setSsoToken] = useState<string | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const cannyReady = sdkLoaded && !!ssoToken;
  const isLoading = !needsAuth && !loadFailed && !cannyReady;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/canny/sso", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          if (!cancelled) setNeedsAuth(true);
          return null;
        }
        if (!res.ok) throw new Error("Failed to get feedback session");
        return res.json();
      })
      .then((data) => {
        if (!data || cancelled) return;
        if (data.token) setSsoToken(data.token);
        else {
          setLoadFailed(true);
          toast.error("No token received");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(err?.message ?? "Failed to load feedback");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (document.querySelector(`script[src="${CANNY_SDK_URL}"]`)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSdkLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = CANNY_SDK_URL;
    script.async = true;
    script.onload = () => setSdkLoaded(true);
    script.onerror = () => {
      setLoadFailed(true);
      toast.error("Failed to load feedback widget");
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  useEffect(() => {
    if (!sdkLoaded || !ssoToken || !mountRef.current) return;

    const boardToken = getCannyBoardToken();
    if (!boardToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadFailed(true);
      toast.error("Feedback board not configured");
      return;
    }

    if (typeof window.Canny !== "function") {
      setLoadFailed(true);
      toast.error("Feedback widget not available");
      return;
    }

    const node = mountRef.current;
    node.innerHTML = "";

    window.Canny("render", {
      boardToken,
      basePath: "/dashboard/feedback",
      ssoToken,
      theme: cannyTheme,
    });

    return () => {
      if (node) node.innerHTML = "";
    };
  }, [sdkLoaded, ssoToken, cannyTheme]);

  if (needsAuth) {
    return (
      <div className="flex h-full flex-col">
        <FeedbackHeader />
        <div className="mt-6">
          <GuestSignInPrompt
            title="Sign in to share feedback"
            description="Vote on features, report bugs, and suggest improvements. Sign in so we can attribute your feedback to your account."
          />
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <FeedbackHeader />
        <p className="text-muted-foreground max-w-md">
          We couldn&apos;t load the feedback board here—you can share feedback
          directly on Canny. Or you can always email us at{" "}
          <a
            href="mailto:support@social0.app"
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            support@social0.app
          </a>
          .
        </p>
        <a
          href={CANNY_FALLBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          Open feedback board
        </a>
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <>
          <div
            className="fixed left-0 right-0 top-0 z-50 h-1 bg-accent/20 overflow-hidden"
            role="progressbar"
            aria-label="Loading feedback board"
          >
            <div
              className="h-full w-1/3 bg-accent"
              style={{
                animation: "feedback-page-load 1.2s ease-in-out infinite",
              }}
            />
          </div>
          <style
            dangerouslySetInnerHTML={{
              __html: `@keyframes feedback-page-load{0%{transform:translateX(-100%)}50%{transform:translateX(200%)}100%{transform:translateX(-100%)}}`,
            }}
          />
        </>
      )}

      <div className="flex h-full flex-col">
        <FeedbackHeader />
        <div className="relative min-h-0 flex-1 mt-6 rounded-xl border border-border bg-bg-elevated">
          {isLoading && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/80 backdrop-blur-sm"
              aria-label="Loading feedback board"
            >
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
                role="presentation"
              />
              <p className="text-sm text-muted-foreground">
                Loading feedback board…
              </p>
            </div>
          )}
          <div
            ref={mountRef}
            data-canny
            className="h-full min-h-[min(70vh,560px)] min-w-0 p-2 sm:p-4"
          />
        </div>
      </div>
    </>
  );
}

function FeedbackHeader() {
  return (
    <header className="shrink-0 border-b border-border bg-bg-elevated px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          Feedback or Feature Request
        </h1>
        <DocsInfoIcon url={DOCS_FEEDBACK_URL} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Vote on features, report bugs, and suggest improvements. Be the first to
        suggest a feature or report an issue. Or you can always email us at{" "}
        <a
          href="mailto:support@social0.app"
          className="text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          support@social0.app
        </a>
        .
      </p>
    </header>
  );
}

"use client";

import { DOCS_FEEDBACK_URL } from "@/lib/docs-url";
import { useEffect, useRef, useState } from "react";
import { MdQuestionMark } from "react-icons/md";

declare global {
  interface Window {
    Canny?: (method: string, options: Record<string, unknown>) => void;
  }
}

const CANNY_SDK_URL = "https://sdk.canny.io/sdk.js";
const CANNY_FALLBACK_URL = "https://social0.canny.io";

export default function FeedbackPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ssoToken, setSsoToken] = useState<string | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const cannyReady = sdkLoaded && !!ssoToken && !error;
  const isLoading = !cannyReady && !error;

  // Fetch SSO token on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/canny/sso", { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) throw new Error("Unauthorized");
          throw new Error("Failed to get feedback session");
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data?.token) setSsoToken(data.token);
        if (!cancelled && !data?.token) setError("No token received");
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load feedback");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load Canny SDK script
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
    script.onerror = () => setError("Failed to load feedback widget");
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  // Render Canny when SDK and token are ready
  useEffect(() => {
    if (!sdkLoaded || !ssoToken || !mountRef.current || error) return;

    const boardToken = process.env.NEXT_PUBLIC_CANNY_BOARD_TOKEN;
    if (!boardToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Feedback board not configured");
      return;
    }

    if (typeof window.Canny !== "function") {
      setError("Feedback widget not available");
      return;
    }

    window.Canny("render", {
      boardToken,
      basePath: "/dashboard/feedback",
      ssoToken,
      theme: "auto",
    });
  }, [sdkLoaded, ssoToken, error]);

  return (
    <>
      <a
        href={DOCS_FEEDBACK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
      </a>
      {/* Loading bar: fixed at top until Canny is ready */}
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

      {error ? (
        <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Feedback</h1>
          <p className="text-muted-foreground">
            We couldn’t load the feedback board. You can share feedback directly
            on Canny.
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
      ) : (
        <div className="flex h-full flex-col">
          <header className="shrink-0 border-b border-border bg-bg-elevated px-4 py-4 sm:px-6">
            <h1 className="text-2xl font-extrabold text-foreground">
              Feedback
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Vote on features, report bugs, and suggest improvements.
            </p>
          </header>
          <div className="relative min-h-0 flex-1 mt-10">
            {isLoading && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/80"
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
            <div ref={mountRef} data-canny className="h-full min-h-[200px]" />
          </div>
        </div>
      )}
    </>
  );
}

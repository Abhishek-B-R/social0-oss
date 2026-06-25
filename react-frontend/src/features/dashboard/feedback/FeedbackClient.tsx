import DocsInfoIcon from "@/components/info-icon";
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

/** Canny board embed — caller must ensure the user is signed in. */
export function FeedbackBoard() {
  const { resolvedTheme } = useTheme();
  const cannyTheme = resolvedTheme === "dark" ? "dark" : "light";

  const mountRef = useRef<HTMLDivElement>(null);
  const [ssoToken, setSsoToken] = useState<string | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const cannyReady = sdkLoaded && !!ssoToken;
  const isLoading = !loadFailed && !cannyReady;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/canny/sso", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          if (!cancelled) setLoadFailed(true);
          return null;
        }
        if (res.status === 503) {
          if (!cancelled) setLoadFailed(true);
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

  if (loadFailed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <FeedbackHeader />
        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-bg-elevated p-8 text-center">
          <p className="max-w-md text-muted-foreground">
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
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FeedbackHeader />
      <div className="relative mt-6 min-h-0 flex-1 rounded-xl border border-border bg-bg-elevated">
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
  );
}

export function FeedbackHeader() {
  return (
    <header className="shrink-0 border-b border-border bg-bg-elevated px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2">
        <h1 className="mb-2 flex items-center gap-2 font-serif text-3xl font-semibold tracking-tight text-foreground landing">
          Feedback or Feature Request
        </h1>
        <DocsInfoIcon url={DOCS_FEEDBACK_URL} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Vote on features, report bugs, and suggest improvements. Or you can always
        email us at{" "}
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

/** @deprecated Use FeedbackPageClient */
export function FeedbackClient() {
  return <FeedbackBoard />;
}

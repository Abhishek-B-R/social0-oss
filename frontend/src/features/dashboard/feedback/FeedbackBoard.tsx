import DocsInfoIcon from "@/components/info-icon";
import { DOCS_FEEDBACK_URL } from "@/lib/docs-url";
import { getCannyBoardToken } from "@/lib/env";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchApi } from "@/lib/fetch-api";

declare global {
  interface Window {
    Canny?: (method: string, options: Record<string, unknown>) => void;
  }
}

const CANNY_SDK_URL = "https://sdk.canny.io/sdk.js";
const CANNY_FALLBACK_URL = "https://social0.canny.io";
const CANNY_SDK_SCRIPT_ID = "canny-jssdk";

/** Official Canny stub so `Canny(...)` calls queue until sdk.js finishes loading. */
function ensureCannyStub(): void {
  if (typeof window.Canny === "function") return;
  const queue: unknown[][] = [];
  const stub = (...args: unknown[]) => {
    queue.push(args);
  };
  (stub as typeof stub & { q: unknown[][] }).q = queue;
  window.Canny = stub as Window["Canny"];
}

function loadCannySdk(): Promise<void> {
  ensureCannyStub();

  const existing = document.getElementById(
    CANNY_SDK_SCRIPT_ID,
  ) as HTMLScriptElement | null;

  if (existing) {
    if (existing.dataset.loaded === "1") {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      existing.addEventListener(
        "load",
        () => {
          existing.dataset.loaded = "1";
          resolve();
        },
        { once: true },
      );
      existing.addEventListener(
        "error",
        () =>
          reject(
            new Error(
              "Failed to load feedback widget (blocked or unreachable). Check CSP allows sdk.canny.io.",
            ),
          ),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = CANNY_SDK_SCRIPT_ID;
    script.src = CANNY_SDK_URL;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () =>
      reject(
        new Error(
          "Failed to load feedback widget (blocked or unreachable). Check CSP allows sdk.canny.io.",
        ),
      );
    document.body.appendChild(script);
  });
}

async function resolveBoardToken(): Promise<string> {
  const fromEnv = getCannyBoardToken();
  if (fromEnv) return fromEnv;

  const res = await fetchApi("/api/canny/config");
  if (!res.ok) {
    throw new Error("Feedback board not configured");
  }
  const data = (await res.json()) as { boardToken?: string };
  if (!data.boardToken) {
    throw new Error("Feedback board not configured");
  }
  return data.boardToken;
}

/** Canny board embed - caller must ensure the user is signed in. */
export function FeedbackBoard() {
  const { resolvedTheme } = useTheme();
  const cannyTheme = resolvedTheme === "dark" ? "dark" : "light";
  const themeReady = resolvedTheme === "dark" || resolvedTheme === "light";

  const mountRef = useRef<HTMLDivElement>(null);
  const [ssoToken, setSsoToken] = useState<string | null>(null);
  const [boardToken, setBoardToken] = useState<string | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const cannyReady = sdkLoaded && !!ssoToken && !!boardToken && themeReady;
  const isLoading = !loadFailed && !cannyReady;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [ssoRes, boardTokenValue] = await Promise.all([
          fetchApi("/api/canny/sso", { credentials: "include" }),
          resolveBoardToken(),
        ]);

        if (cancelled) return;

        if (ssoRes.status === 401) {
          setLoadFailed(true);
          return;
        }
        if (ssoRes.status === 503) {
          throw new Error("Canny SSO is not configured on the server");
        }
        if (!ssoRes.ok) {
          throw new Error("Failed to get feedback session");
        }

        const ssoData = (await ssoRes.json()) as { token?: string };
        if (!ssoData.token) {
          throw new Error("No token received");
        }

        setSsoToken(ssoData.token);
        setBoardToken(boardTokenValue);
      } catch (err) {
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(
            err instanceof Error ? err.message : "Failed to load feedback",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadCannySdk()
      .then(() => {
        if (!cancelled) setSdkLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(err instanceof Error ? err.message : "Failed to load feedback widget");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sdkLoaded || !ssoToken || !boardToken || !mountRef.current) return;

    if (typeof window.Canny !== "function") {
      queueMicrotask(() => {
        setLoadFailed(true);
        toast.error("Feedback widget not available");
      });
      return;
    }

    // Wait for theme hydration so we don't tear down/rebuild the board once.
    if (!themeReady) return;

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
  }, [sdkLoaded, ssoToken, boardToken, cannyTheme, themeReady]);

  if (loadFailed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <FeedbackHeader />
        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-bg-elevated p-8 text-center">
          <p className="max-w-md text-muted-foreground">
            We couldn&apos;t load the feedback board here-you can share feedback
            directly on Canny. Or you can always email us at{" "}
            <a
              href="mailto:support@social0.app"
              className="text-accent hover:underline"
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
        Vote on features, report bugs, and suggest improvements. Or you can
        always email us at{" "}
        <a
          href="mailto:support@social0.app"
          className="text-accent hover:underline"
        >
          support@social0.app
        </a>
        .
      </p>
    </header>
  );
}

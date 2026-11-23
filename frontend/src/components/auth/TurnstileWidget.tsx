import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile site key. When it is set the API is expected to hold the
 * matching `TURNSTILE_SECRET_KEY`, which makes `/api/auth/sign-up` refuse any
 * request without a token: configure both or neither.
 */
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
  sitekey: string;
  action?: string;
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "flexible" | "compact";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error("Turnstile did not initialise"));
      };
      script.onerror = () => reject(new Error("Turnstile failed to load"));
      document.head.appendChild(script);
    }).catch((err: unknown) => {
      // Let the next mount try again (a blocker turned off, a flaky network).
      scriptPromise = null;
      throw err;
    });
  }
  return scriptPromise;
}

/**
 * Turnstile challenge for the sign-up form. Reports a token when solved and
 * `null` when it expires or errors. A token is single-use: remount the widget
 * (change its `key`) after every submission that spent one.
 */
export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  /** Must be stable (a `useState` setter is). */
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let widgetId: string | null = null;

    loadTurnstile().then(
      (api) => {
        if (cancelled) return;
        widgetId = api.render(container, {
          sitekey: siteKey,
          action: "sign-up",
          theme: "auto",
          size: "flexible",
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      },
      () => {
        if (!cancelled) setLoadFailed(true);
      },
    );

    return () => {
      cancelled = true;
      onToken(null);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, onToken]);

  return (
    <div>
      <div ref={containerRef} className="min-h-[65px]" />
      {loadFailed ? (
        <p role="alert" className="mt-1 text-[13px] text-red-500">
          The verification check couldn't load. Turn off content blockers for
          this site and refresh the page.
        </p>
      ) : null}
    </div>
  );
}

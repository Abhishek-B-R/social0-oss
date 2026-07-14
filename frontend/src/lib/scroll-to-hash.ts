import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const LANDING_PATHS = new Set(["/", "/home"]);
const HEADER_SCROLL_MARGIN_PX = 72;

/** Scroll to a document fragment, offset for the sticky landing header. */
export function scrollToHash(
  hash: string,
  behavior: ScrollBehavior = "smooth",
): boolean {
  const id = decodeURIComponent(hash.replace(/^#/, "").trim());
  if (!id) return false;

  const el = document.getElementById(id);
  if (!el) return false;

  const top =
    el.getBoundingClientRect().top +
    window.scrollY -
    HEADER_SCROLL_MARGIN_PX;
  window.scrollTo({ top: Math.max(0, top), behavior });
  return true;
}

/** React Router won't scroll to #sections — retry until landing sections mount. */
export function useLandingHashScroll(): void {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash || !LANDING_PATHS.has(pathname)) return;

    let cancelled = false;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      if (scrollToHash(hash)) return;
      // Deferred/lazy sections need a bit longer to mount after a hash visit.
      if (attempts++ < 40) {
        window.setTimeout(run, 100);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [hash, pathname]);
}

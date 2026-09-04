/**
 * Mobile viewport + keyboard insets, published as CSS custom properties.
 *
 * Why this exists: on iOS Safari the on-screen keyboard does **not** resize
 * the layout viewport. A `position: fixed; bottom: 0` element — our bottom
 * sheets, sticky composer action bars, the tab bar — therefore stays pinned
 * to the bottom of the *layout* viewport and ends up hidden behind the
 * keyboard. `100vh` has the same class of problem with the collapsing URL
 * bar.
 *
 * The VisualViewport API is the only reliable source of truth for what the
 * user can actually see, so we read it once and expose it to CSS:
 *
 *   --vv-height  visible viewport height in px
 *   --kb-inset   px of the viewport currently covered by the keyboard (0 when closed)
 *
 * CSS then anchors to `bottom: var(--kb-inset, 0px)` and stays above the
 * keyboard. Android Chrome mostly handles this itself via
 * `interactive-widget=resizes-content`, and reports ~0 here; that is fine —
 * the two mechanisms are additive, not conflicting.
 */

/** Below this we treat the delta as browser chrome, not a keyboard. */
const KEYBOARD_MIN_INSET_PX = 120;

export function installMobileViewportListener(): () => void {
  if (typeof window === "undefined") return () => {};

  const vv = window.visualViewport;
  const root = document.documentElement;

  const apply = () => {
    const viewportHeight = vv?.height ?? window.innerHeight;
    root.style.setProperty("--vv-height", `${Math.round(viewportHeight)}px`);

    // How much of the layout viewport the visual viewport no longer covers.
    // `offsetTop` matters when the page is scrolled under a pinned keyboard.
    const covered = vv
      ? window.innerHeight - vv.height - vv.offsetTop
      : 0;
    const inset = covered > KEYBOARD_MIN_INSET_PX ? Math.round(covered) : 0;
    root.style.setProperty("--kb-inset", `${inset}px`);
    root.dataset.keyboard = inset > 0 ? "open" : "closed";
  };

  apply();

  if (!vv) {
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }

  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
  window.addEventListener("orientationchange", apply);
  return () => {
    vv.removeEventListener("resize", apply);
    vv.removeEventListener("scroll", apply);
    window.removeEventListener("orientationchange", apply);
  };
}

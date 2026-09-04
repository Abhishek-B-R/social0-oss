/**
 * Touch-vs-pointer helpers for behaviour that cannot be expressed in CSS.
 *
 * Styling should use the `touch:` / `fine:` / `hoverable:` Tailwind variants
 * (declared in index.css) instead. This module is only for behaviour that
 * has to be decided in JS — chiefly whether to steal focus on mount.
 */

/** True when the primary input is a precise pointer (mouse / trackpad). */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: fine)").matches;
}

/**
 * Whether a field may claim focus as soon as its screen mounts.
 *
 * On a phone, focusing on mount throws up the on-screen keyboard before the
 * user has seen the screen — it swallows roughly half the viewport, hides
 * the very controls (platform pickers, schedule, publish) the user needs to
 * orient, and there is no obvious way back other than dismissing it. Native
 * apps do not do this. Desktop keeps autofocus, where it costs nothing and
 * saves a click.
 *
 * Deliberately evaluated per call rather than cached: a hybrid device
 * (iPad + Magic Keyboard, Surface) can change primary pointer mid-session.
 */
export function shouldAutoFocusOnMount(): boolean {
  return hasFinePointer();
}

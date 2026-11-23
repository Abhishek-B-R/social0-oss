import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/AppLink";
import { cn } from "@/lib/utils";
import type { PostNavState } from "./post-nav";

const EDGE_PX_MIN = 40;
const EDGE_PX_MAX = 56;

/** Thinner on small main panes; never as wide as the old 72px strip. */
function edgeWidthPx(mainWidth: number): number {
  if (mainWidth < 700) return EDGE_PX_MIN;
  if (mainWidth < 1000) return 48;
  return EDGE_PX_MAX;
}
/** A gutter narrower than this gets no strip: too thin to aim at. */
const MIN_GUTTER_PX = 24;
/** Below this width a strip shows its chevron only; the word would overflow. */
const LABEL_MIN_PX = 44;
/** Resting on one of these never arms a strip. */
const INTERACTIVE_SELECTOR =
  "a, button, input, textarea, select, label, summary, [role='button'], [role='link'], [role='menuitem'], [contenteditable='true']";
/** Dwell before showing — left is longer so sidebar aims don’t flash. */
const SHOW_DELAY_LEFT_MS = 200;
const SHOW_DELAY_RIGHT_MS = 120;

/** Mouse/trackpad desktops only — no hover cursor on phones/tablets. */
const DESKTOP_POINTER_MQ = "(hover: hover) and (pointer: fine)";

function useDesktopPointer(): boolean {
  const [ok, setOk] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(DESKTOP_POINTER_MQ).matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_POINTER_MQ);
    const sync = () => setOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return ok;
}

type Strip = { x: number; width: number };
type Zones = { top: number; bottom: number; left: Strip | null; right: Strip | null };

/**
 * Desktop-only (mouse/trackpad) edge strips in the empty gutters of the
 * dashboard main pane, between its inner edges (scrollbar excluded) and the
 * page container. They never cover page content (the Back link, the ⋯ button,
 * a delivery's Retry) or the main pane's scrollbar: a strip is at most as wide
 * as its gutter, and a gutter too narrow to aim at gets none.
 * Neighbors follow the list context the user came from (status + filters + sort).
 * Hitting either extreme shows both sides. Missing neighbors stay visible
 * but unclickable. ←/→ when not typing. Left = prev in list, right = next.
 */
export function PostAdjacentNav({
  prevHref,
  nextHref,
  state: preservedState,
}: {
  prevHref: string | null;
  nextHref: string | null;
  state: PostNavState;
}) {
  const desktopPointer = useDesktopPointer();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [bounds, setBounds] = useState<Zones | null>(null);
  const [atEdge, setAtEdge] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSideRef = useRef<"left" | "right" | null>(null);
  const atEdgeRef = useRef(false);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current != null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    pendingSideRef.current = null;
  }, []);

  const hideEdge = useCallback(() => {
    clearShowTimer();
    atEdgeRef.current = false;
    setAtEdge(false);
  }, [clearShowTimer]);

  useEffect(() => {
    if (!desktopPointer) return;
    const main =
      document.querySelector<HTMLElement>("[data-dashboard-main]") ??
      document.querySelector("main");
    const container = anchorRef.current?.closest<HTMLElement>("[data-page-container]") ?? null;
    if (!main || !container) return;

    const update = () => {
      const r = main.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      // client* excludes the main pane's own scrollbars.
      const innerLeft = r.left + main.clientLeft;
      const innerRight = innerLeft + main.clientWidth;
      const top = r.top + main.clientTop;
      const cap = edgeWidthPx(main.clientWidth);
      const leftGutter = c.left - innerLeft;
      const rightGutter = innerRight - c.right;
      const leftWidth = Math.min(cap, leftGutter);
      const rightWidth = Math.min(cap, rightGutter);
      setBounds({
        top,
        bottom: top + main.clientHeight,
        left: leftGutter >= MIN_GUTTER_PX ? { x: innerLeft, width: leftWidth } : null,
        right:
          rightGutter >= MIN_GUTTER_PX
            ? { x: innerRight - rightWidth, width: rightWidth }
            : null,
      });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(main);
    ro.observe(container);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [desktopPointer]);

  useEffect(() => {
    if (!desktopPointer || !bounds) return;
    const within = (x: number, strip: Strip | null) =>
      !!strip && x >= strip.x && x <= strip.x + strip.width;

    const onMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      if (clientY < bounds.top || clientY > bounds.bottom) {
        hideEdge();
        return;
      }
      const onLeft = within(clientX, bounds.left);
      const onRight = within(clientX, bounds.right);
      const hovering = onLeft || onRight;

      if (!hovering) {
        hideEdge();
        return;
      }

      // Already visible — keep it while still on an edge.
      if (atEdgeRef.current) return;

      // Something clickable under the pointer (a popover, a toast) wins.
      if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) {
        clearShowTimer();
        return;
      }

      const side: "left" | "right" = onLeft ? "left" : "right";
      // Same side already counting down — don’t reset (feels sticky).
      if (pendingSideRef.current === side) return;

      clearShowTimer();
      pendingSideRef.current = side;
      const delay = side === "left" ? SHOW_DELAY_LEFT_MS : SHOW_DELAY_RIGHT_MS;
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        pendingSideRef.current = null;
        atEdgeRef.current = true;
        setAtEdge(true);
      }, delay);
    };

    const clear = () => hideEdge();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("blur", clear);
    document.documentElement.addEventListener("mouseleave", clear);
    return () => {
      clearShowTimer();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("blur", clear);
      document.documentElement.removeEventListener("mouseleave", clear);
    };
  }, [desktopPointer, bounds, hideEdge, clearShowTimer]);

  const showing = desktopPointer && bounds && atEdge && typeof document !== "undefined";
  return (
    <>
      {/* Marks this page's container; the gutters are measured from it. */}
      <span ref={anchorRef} hidden />
      {showing && bounds
        ? createPortal(
            <EdgeStrips
              zones={bounds}
              prevHref={prevHref}
              nextHref={nextHref}
              state={preservedState}
            />,
            document.body,
          )
        : null}
    </>
  );
}

const stripClass = (enabled: boolean) =>
  cn(
    "fixed z-[60] flex flex-col items-center justify-center gap-1 px-0.5",
    "bg-bg-muted/80",
    enabled
      ? "cursor-pointer text-text"
      : "pointer-events-none cursor-default text-text/30",
  );
const iconClass = (w: number) =>
  w <= 40 ? "size-5 shrink-0" : w <= 48 ? "size-6 shrink-0" : "size-7 shrink-0";
const labelClass = "max-w-full text-center text-[11px] font-medium leading-tight";

function EdgeStrip({
  strip,
  top,
  height,
  href,
  state,
  side,
}: {
  strip: Strip;
  top: number;
  height: number;
  href: string | null;
  state: PostNavState;
  side: "prev" | "next";
}) {
  const style = { left: strip.x, top, width: strip.width, height };
  const Icon = side === "prev" ? ChevronLeft : ChevronRight;
  const label =
    strip.width < LABEL_MIN_PX ? null : (
      <span className={labelClass}>
        {side === "prev"
          ? strip.width <= 48 ? "Previous" : "Previous post"
          : strip.width <= 48 ? "Next" : "Next post"}
      </span>
    );
  const content = (
    <>
      <Icon className={iconClass(strip.width)} strokeWidth={1.75} />
      {label}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        state={state}
        aria-label={side === "prev" ? "Previous post" : "Next post"}
        className={stripClass(true)}
        style={style}
      >
        {content}
      </Link>
    );
  }
  return (
    <div
      aria-label={side === "prev" ? "No previous post" : "No next post"}
      aria-disabled="true"
      className={stripClass(false)}
      style={style}
    >
      {content}
    </div>
  );
}

function EdgeStrips({
  zones,
  prevHref,
  nextHref,
  state,
}: {
  zones: Zones;
  prevHref: string | null;
  nextHref: string | null;
  state: PostNavState;
}) {
  const height = Math.max(0, zones.bottom - zones.top);
  return (
    <>
      {zones.left ? (
        <EdgeStrip strip={zones.left} top={zones.top} height={height} href={prevHref} state={state} side="prev" />
      ) : null}
      {zones.right ? (
        <EdgeStrip strip={zones.right} top={zones.top} height={height} href={nextHref} state={state} side="next" />
      ) : null}
    </>
  );
}

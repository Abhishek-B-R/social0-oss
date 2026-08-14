import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/AppLink";
import { loadAdjacentPosts } from "@/api/dashboard-data";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import {
  resolvePostListNavContext,
  type PostDetailLocationState,
} from "@/lib/post-detail-back";
import { cn } from "@/lib/utils";

const EDGE_PX_MIN = 40;
const EDGE_PX_MAX = 56;

/** Thinner on small main panes; never as wide as the old 72px strip. */
function edgeWidthPx(mainWidth: number): number {
  if (mainWidth < 700) return EDGE_PX_MIN;
  if (mainWidth < 1000) return 48;
  return EDGE_PX_MAX;
}
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

type MainBounds = { left: number; right: number; top: number; bottom: number };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

/**
 * Desktop-only (mouse/trackpad) edge strips on the dashboard main pane.
 * Neighbors follow the list context the user came from (status + filters + sort).
 * Hitting either extreme shows both sides. Missing neighbors stay visible
 * but unclickable. ←/→ when not typing. Left = prev in list, right = next.
 */
export function PostAdjacentNav({ postId }: { postId: string }) {
  const desktopPointer = useDesktopPointer();
  const dash = useDashboardPath();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as PostDetailLocationState | null) ?? null;
  const from = navState?.from;
  const list = resolvePostListNavContext(navState);
  const preservedState = useMemo(
    (): PostDetailLocationState => ({ from, list }),
    [
      from,
      list.statusFilter,
      list.sort,
      list.platform,
      list.time,
      list.account,
    ],
  );

  const [bounds, setBounds] = useState<MainBounds | null>(null);
  const [atEdge, setAtEdge] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSideRef = useRef<"left" | "right" | null>(null);
  const atEdgeRef = useRef(false);

  const clearShowTimer = () => {
    if (showTimerRef.current != null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    pendingSideRef.current = null;
  };

  const hideEdge = () => {
    clearShowTimer();
    atEdgeRef.current = false;
    setAtEdge(false);
  };

  const { data } = useQuery({
    queryKey: [
      "adjacent-posts",
      postId,
      list.statusFilter ?? null,
      list.sort ?? "newest",
      list.platform ?? null,
      list.time ?? null,
      list.account ?? null,
    ],
    queryFn: () =>
      loadAdjacentPosts({
        postId,
        statusFilter: list.statusFilter ?? null,
        sort: list.sort ?? "newest",
        platform: list.platform ?? null,
        time: list.time ?? null,
        account: list.account ?? null,
      }),
    enabled: desktopPointer && !!postId,
    staleTime: 30_000,
  });

  const prevId =
    data?.ok && data.data.prevId && data.data.prevId !== postId
      ? data.data.prevId
      : null;
  const nextId =
    data?.ok && data.data.nextId && data.data.nextId !== postId
      ? data.data.nextId
      : null;

  useEffect(() => {
    if (!desktopPointer) {
      setBounds(null);
      return;
    }
    const main =
      document.querySelector<HTMLElement>("[data-dashboard-main]") ??
      document.querySelector("main");
    if (!main) return;

    const update = () => {
      const r = main.getBoundingClientRect();
      setBounds({
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
      });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(main);
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
    const edgePx = edgeWidthPx(bounds.right - bounds.left);

    const onMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      if (clientY < bounds.top || clientY > bounds.bottom) {
        hideEdge();
        return;
      }
      const onLeft =
        clientX >= bounds.left && clientX <= bounds.left + edgePx;
      const onRight =
        clientX >= bounds.right - edgePx && clientX <= bounds.right;
      const hovering = onLeft || onRight;

      if (!hovering) {
        hideEdge();
        return;
      }

      // Already visible — keep it while still on an edge.
      if (atEdgeRef.current) return;

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
  }, [desktopPointer, bounds]);

  useEffect(() => {
    hideEdge();
  }, [postId]);

  useEffect(() => {
    if (!desktopPointer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        navigate(dash(`posts/${prevId}`), { state: preservedState });
      } else if (e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        navigate(dash(`posts/${nextId}`), { state: preservedState });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktopPointer, prevId, nextId, dash, navigate, preservedState]);

  if (!desktopPointer || !bounds || !atEdge || typeof document === "undefined") {
    return null;
  }

  const height = Math.max(0, bounds.bottom - bounds.top);
  const edgePx = edgeWidthPx(bounds.right - bounds.left);
  const stripClass = (enabled: boolean) =>
    cn(
      "fixed z-[60] flex flex-col items-center justify-center gap-1 px-0.5",
      "bg-black/[0.08] dark:bg-white/[0.10]",
      enabled
        ? "cursor-pointer text-text"
        : "pointer-events-none cursor-default text-text/30",
    );
  const iconClass =
    edgePx <= 40 ? "size-5 shrink-0" : edgePx <= 48 ? "size-6 shrink-0" : "size-7 shrink-0";
  const labelClass =
    "max-w-full text-center text-[9px] font-medium leading-tight tracking-wide";

  const leftStyle = {
    left: bounds.left,
    top: bounds.top,
    width: edgePx,
    height,
  };
  const rightStyle = {
    left: bounds.right - edgePx,
    top: bounds.top,
    width: edgePx,
    height,
  };

  const prevLabel = edgePx <= 48 ? "Previous" : "Previous post";
  const nextLabel = edgePx <= 48 ? "Next" : "Next post";

  const node = (
    <>
      {prevId ? (
        <Link
          href={dash(`posts/${prevId}`)}
          state={preservedState}
          aria-label="Previous post"
          className={stripClass(true)}
          style={leftStyle}
        >
          <ChevronLeft className={iconClass} strokeWidth={1.75} />
          <span className={labelClass}>{prevLabel}</span>
        </Link>
      ) : (
        <div
          aria-label="No previous post"
          aria-disabled="true"
          className={stripClass(false)}
          style={leftStyle}
        >
          <ChevronLeft className={iconClass} strokeWidth={1.75} />
          <span className={labelClass}>{prevLabel}</span>
        </div>
      )}

      {nextId ? (
        <Link
          href={dash(`posts/${nextId}`)}
          state={preservedState}
          aria-label="Next post"
          className={stripClass(true)}
          style={rightStyle}
        >
          <ChevronRight className={iconClass} strokeWidth={1.75} />
          <span className={labelClass}>{nextLabel}</span>
        </Link>
      ) : (
        <div
          aria-label="No next post"
          aria-disabled="true"
          className={stripClass(false)}
          style={rightStyle}
        >
          <ChevronRight className={iconClass} strokeWidth={1.75} />
          <span className={labelClass}>{nextLabel}</span>
        </div>
      )}
    </>
  );

  return createPortal(node, document.body);
}

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadAdjacentPosts } from "@/api/dashboard-data";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { cn } from "@/lib/utils";

const EDGE_PX = 48;

type MainBounds = { left: number; right: number; top: number; bottom: number };

/**
 * Full-height edge strips on the dashboard main pane only.
 * Hitting either extreme shows both sides. Missing neighbors stay visible
 * but unclickable. Newest-first: left → newer, right → older.
 */
export function PostAdjacentNav({ postId }: { postId: string }) {
  const dash = useDashboardPath();
  const [bounds, setBounds] = useState<MainBounds | null>(null);
  const [atEdge, setAtEdge] = useState(false);

  const { data } = useQuery({
    queryKey: ["adjacent-posts", postId],
    queryFn: () => loadAdjacentPosts(postId),
    enabled: !!postId,
    staleTime: 30_000,
  });

  const newerId =
    data?.ok && data.data.newerId && data.data.newerId !== postId
      ? data.data.newerId
      : null;
  const olderId =
    data?.ok && data.data.olderId && data.data.olderId !== postId
      ? data.data.olderId
      : null;

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!bounds) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const onMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      if (clientY < bounds.top || clientY > bounds.bottom) {
        setAtEdge(false);
        return;
      }
      const onLeft =
        clientX >= bounds.left && clientX <= bounds.left + EDGE_PX;
      const onRight =
        clientX >= bounds.right - EDGE_PX && clientX <= bounds.right;
      setAtEdge(onLeft || onRight);
    };

    const clear = () => setAtEdge(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("blur", clear);
    document.documentElement.addEventListener("mouseleave", clear);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("blur", clear);
      document.documentElement.removeEventListener("mouseleave", clear);
    };
  }, [bounds]);

  useEffect(() => {
    setAtEdge(false);
  }, [postId]);

  if (!bounds || !atEdge || typeof document === "undefined") return null;

  const height = Math.max(0, bounds.bottom - bounds.top);
  const stripClass = (enabled: boolean) =>
    cn(
      "fixed z-[60] flex items-center justify-center",
      "bg-black/[0.08] dark:bg-white/[0.10]",
      enabled
        ? "cursor-pointer text-text"
        : "pointer-events-none cursor-default text-text/30",
    );
  const iconClass = "size-8 shrink-0";

  const leftStyle = {
    left: bounds.left,
    top: bounds.top,
    width: EDGE_PX,
    height,
  };
  const rightStyle = {
    left: bounds.right - EDGE_PX,
    top: bounds.top,
    width: EDGE_PX,
    height,
  };

  const node = (
    <>
      {newerId ? (
        <a
          href={dash(`posts/${newerId}`)}
          aria-label="Newer post"
          className={stripClass(true)}
          style={leftStyle}
        >
          <ChevronLeft className={iconClass} strokeWidth={1.75} />
        </a>
      ) : (
        <div
          aria-label="No newer post"
          aria-disabled="true"
          className={stripClass(false)}
          style={leftStyle}
        >
          <ChevronLeft className={iconClass} strokeWidth={1.75} />
        </div>
      )}

      {olderId ? (
        <a
          href={dash(`posts/${olderId}`)}
          aria-label="Older post"
          className={stripClass(true)}
          style={rightStyle}
        >
          <ChevronRight className={iconClass} strokeWidth={1.75} />
        </a>
      ) : (
        <div
          aria-label="No older post"
          aria-disabled="true"
          className={stripClass(false)}
          style={rightStyle}
        >
          <ChevronRight className={iconClass} strokeWidth={1.75} />
        </div>
      )}
    </>
  );

  return createPortal(node, document.body);
}

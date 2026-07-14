import {
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";

type DeferredSectionProps = {
  children: ReactNode;
  /** Placeholder height until the section enters the viewport. */
  minHeight?: string;
  /** Start loading slightly before the section is visible. */
  rootMargin?: string;
};

function SectionFallback({ minHeight }: { minHeight: string }) {
  return (
    <div
      className="mx-auto max-w-[1100px] animate-pulse rounded-2xl bg-muted/30"
      style={{ minHeight }}
      aria-hidden
    />
  );
}

/**
 * Keeps lazy landing chunks off the critical path until near viewport.
 * `React.lazy` alone still mounts every Suspense child immediately.
 * Hash links (#pricing, etc.) force-mount so scroll targets exist.
 */
export function DeferredSection({
  children,
  minHeight = "12rem",
  rootMargin = "240px 0px",
}: DeferredSectionProps) {
  const { hash } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => Boolean(hash));

  useEffect(() => {
    if (hash) setActive(true);
  }, [hash]);

  useEffect(() => {
    const el = ref.current;
    if (!el || active) return;

    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setActive(true);
        io.disconnect();
      },
      { rootMargin },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [active, rootMargin]);

  return (
    <div ref={ref}>
      {active ? (
        <Suspense fallback={<SectionFallback minHeight={minHeight} />}>
          {children}
        </Suspense>
      ) : (
        <SectionFallback minHeight={minHeight} />
      )}
    </div>
  );
}

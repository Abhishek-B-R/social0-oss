import { useEffect, useRef } from "react";

export function InboxScrollSentinel({
  onVisible,
  disabled,
  loading,
}: {
  onVisible: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const root = el.parentElement;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !loading) onVisible();
      },
      { root, rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible, disabled, loading]);

  return (
    <li ref={ref} className="list-none px-2 py-0.5" aria-hidden={!loading}>
      {loading ? (
        <div className="flex gap-2.5 rounded-2xl px-2.5 py-2.5" aria-busy>
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-bg-muted" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <div className="h-3 w-2/5 animate-pulse rounded bg-bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-bg-muted/70" />
          </div>
        </div>
      ) : null}
    </li>
  );
}

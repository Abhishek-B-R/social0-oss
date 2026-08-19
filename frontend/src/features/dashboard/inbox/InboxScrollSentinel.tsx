import { useEffect, useRef } from "react";
import { CircleNotch } from "@/icons/phosphor";

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
        if (entry?.isIntersecting) onVisible();
      },
      { root, rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible, disabled]);

  return (
    <li
      ref={ref}
      className="flex list-none items-center justify-center py-3"
      aria-hidden={!loading}
    >
      {loading ? (
        <CircleNotch size={16} className="animate-spin text-text-muted" />
      ) : null}
    </li>
  );
}

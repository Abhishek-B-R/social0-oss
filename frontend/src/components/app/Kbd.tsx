import { cn } from "@/lib/utils";
import { formatShortcut } from "./shortcuts";

/**
 * Keyboard key hint. Pass `keys` in shortcut syntax ("mod+k", "g h", "?")
 * to render platform-correct glyphs (⌘ on Mac, Ctrl elsewhere), or plain
 * `children` for a single literal cap.
 */
export function Kbd({
  keys,
  children,
  className,
}: {
  keys?: string;
  children?: string;
  className?: string;
}) {
  const parts = keys ? formatShortcut(keys) : [children ?? ""];
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {parts.map((p, i) => (
        <kbd
          key={`${p}-${i}`}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-bg-subtle px-1 font-sans text-[11px] font-medium leading-none text-text-muted"
        >
          {p}
        </kbd>
      ))}
    </span>
  );
}

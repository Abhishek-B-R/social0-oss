
import * as React from "react";
import { cn } from "@/lib/utils";

const DEFAULT_MAX_HEIGHT_PX = 280;

export interface AutoResizeTextareaProps
  extends React.ComponentProps<"textarea"> {
  /** Max height in pixels; after this the textarea scrolls. Default 280. */
  maxHeight?: number;
}

const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(function AutoResizeTextarea(
  { className, style, maxHeight = DEFAULT_MAX_HEIGHT_PX, value, onChange, ...props },
  ref
) {
  const internalRef = React.useRef<HTMLTextAreaElement | null>(null);
  const mergedRef = (el: HTMLTextAreaElement | null) => {
    internalRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const resize = React.useCallback(() => {
    const el = internalRef.current;
    if (!el) return;
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${capped}px`;
  }, [maxHeight]);

  React.useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  return (
    <textarea
      ref={mergedRef}
      value={value}
      onChange={onChange}
      className={cn(
        "resize-none overflow-y-auto",
        className
      )}
      style={{ maxHeight: `${maxHeight}px`, ...style }}
      {...props}
    />
  );
});

export { AutoResizeTextarea };

import type { ReactNode } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type BannerProps = {
  /**
   * blocking: amber, something will fail until fixed (reconnect, posts exhausted).
   * info: blue, FYI.
   * danger: red, something already failed.
   */
  tier?: "blocking" | "info" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons/links on the right. */
  actions?: ReactNode;
  /** Shows an X; caller decides how long the dismissal lasts. */
  onDismiss?: () => void;
  dismissLabel?: string;
  icon?: ReactNode;
  className?: string;
};

const TIER = {
  blocking: {
    box: "border-warning-border bg-warning-soft",
    icon: "text-warning",
    Icon: AlertTriangle,
  },
  danger: {
    box: "border-danger-border bg-danger-soft",
    icon: "text-danger",
    Icon: AlertTriangle,
  },
  info: {
    box: "border-info-border bg-info-soft",
    icon: "text-info",
    Icon: Info,
  },
} as const;

/** Alert strip. Use sparingly: only blocking problems get a page-top banner. */
export function Banner({
  tier = "info",
  title,
  children,
  actions,
  onDismiss,
  dismissLabel = "Dismiss",
  icon,
  className,
}: BannerProps) {
  const t = TIER[tier];
  return (
    <div
      role={tier === "info" ? "status" : "alert"}
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center",
        t.box,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className={cn("mt-0.5 shrink-0 [&_svg]:size-4", t.icon)} aria-hidden>
          {icon ?? <t.Icon />}
        </span>
        <div className="min-w-0 text-sm text-text">
          {title ? <span className="font-semibold">{title}</span> : null}
          {title && children ? " " : null}
          {children}
        </div>
      </div>
      {actions || onDismiss ? (
        <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
          {actions}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={dismissLabel}
              className="inline-flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-black/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 dark:hover:bg-white/10"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

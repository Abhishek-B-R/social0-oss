import type { ReactNode } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import Link from "@/components/AppLink";
import { cn } from "@/lib/utils";

export type StateAction = {
  label: string;
  /** Internal path (use `useDashboardPath`) or external URL. */
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
};

function ActionButton({
  action,
  variant,
}: {
  action: StateAction;
  variant: "primary" | "secondary" | "text";
}) {
  const cls = cn(
    "inline-flex items-center justify-center gap-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    variant === "text"
      ? "rounded-md text-accent underline-offset-2 hover:underline"
      : "h-9 rounded-xl px-4 touch:h-11",
    variant === "primary" && "bg-accent text-accent-foreground shadow-sm hover:bg-accent-hover",
    variant === "secondary" && "border border-border bg-bg-elevated text-text hover:bg-bg-muted",
  );
  if (action.href) {
    return (
      <Link href={action.href} className={cls} onClick={action.onClick}>
        {variant === "text" ? null : action.icon}
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={action.onClick}>
      {variant === "text" ? null : action.icon}
      {action.label}
    </button>
  );
}

/**
 * Empty list / page. One title, one line, up to two actions
 * (e.g. "Write a post" / "Let my agent post").
 *
 * `compact` is for empty sections inside cards, drawers and tables: one
 * left-aligned line (title, then the description muted) with text-link
 * actions. No icon, no box. The full variant is for an empty page.
 */
export function EmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  className,
  compact = false,
}: {
  title: string;
  description?: ReactNode;
  /** Full variant only; compact ignores it. */
  icon?: ReactNode;
  primaryAction?: StateAction;
  secondaryAction?: StateAction;
  className?: string;
  /** One left-aligned line, for empty states inside cards/drawers. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm",
          className,
        )}
      >
        <p className="text-text-muted">
          <span className="text-text">{title}</span>
          {description ? <> {description}</> : null}
        </p>
        {primaryAction ? <ActionButton action={primaryAction} variant="text" /> : null}
        {secondaryAction ? <ActionButton action={secondaryAction} variant="text" /> : null}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 text-text-subtle [&_svg]:size-6" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>
      ) : null}
      {primaryAction || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primaryAction ? <ActionButton action={primaryAction} variant="primary" /> : null}
          {secondaryAction ? (
            <ActionButton action={secondaryAction} variant="secondary" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Failed fetch. Says what happened and always offers Retry.
 * `message` should be specific ("Couldn't load your posts.").
 */
export function ErrorState({
  message,
  detail,
  onRetry,
  retrying = false,
  className,
  compact = false,
}: {
  message: string;
  /** Server error text, shown smaller. */
  detail?: string | null;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-danger-border bg-danger-soft/50 text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
    >
      <AlertCircle className="mb-2 size-5 text-danger" aria-hidden />
      <p className="text-sm font-medium text-text">{message}</p>
      {detail ? (
        <p className="mt-1 max-w-md text-xs text-text-muted">{detail}</p>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-bg-elevated px-4 text-sm font-medium text-text transition-colors hover:bg-bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
      >
        <RotateCw
          className={cn("size-3.5", retrying && "animate-spin motion-reduce:animate-none")}
          aria-hidden
        />
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

/** Inline (single-line) error with retry, for cards and table footers. */
export function InlineError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <p role="alert" className={cn("flex flex-wrap items-center gap-2 text-sm text-danger", className)}>
      <AlertCircle className="size-4 shrink-0" aria-hidden />
      <span>{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="font-medium text-text underline underline-offset-2 hover:no-underline"
        >
          Retry
        </button>
      ) : null}
    </p>
  );
}

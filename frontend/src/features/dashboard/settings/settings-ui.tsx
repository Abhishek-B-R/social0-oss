import type { ReactNode } from "react";
import { CaretDown } from "@/icons/phosphor";
import { Skeleton } from "@/components/app/Skeletons";
import { Toggle } from "@/components/app/Toggle";
import { cn } from "@/lib/utils";

/** Shared field classes so every settings control looks the same. */
export const settingsInputClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-bg px-3 text-sm text-text placeholder:text-text-muted transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-danger/20 touch:h-11";

const settingsSelectClass = `${settingsInputClass} appearance-none pr-8 font-medium`;

/** Native select with the dashboard chevron. */
export function SettingsSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select {...props} className={settingsSelectClass}>
        {children}
      </select>
      <CaretDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
}

/**
 * One settings section: a small heading, then rows split by hairlines. No
 * card around it (Claude.ai / Linear style). Leave `title` off when it
 * would only repeat the page title ("Profile" under "Profile").
 * `tone="danger"` = the red "Danger zone" heading; keep it the last section.
 */
export function SettingsCard({
  title,
  description,
  actions,
  children,
  tone = "default",
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
  id?: string;
}) {
  const hasHeader = !!(title || description || actions);
  return (
    <section
      id={id}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn("min-w-0", className)}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-3">
          <div className="min-w-0 flex-1">
            {title ? (
              <h2
                className={cn(
                  "text-[15px] font-semibold",
                  tone === "danger" ? "text-danger" : "text-text",
                )}
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[13px] text-text-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div
        className={cn(
          "divide-y divide-border [&>*]:py-4",
          hasHeader ? "border-t border-border" : "[&>*:first-child]:pt-1",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Same thing, by its real name. */
export const SettingsSection = SettingsCard;

/** Vertical rhythm between sections on a settings page. */
export const settingsStackClass = "space-y-10";

/** Label + one-line explanation on the left, control on the right. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  stack = false,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
  /** Put the control under the label (wide inputs). */
  stack?: boolean;
  className?: string;
}) {
  const labelEl = htmlFor ? (
    <label htmlFor={htmlFor} className="text-sm font-medium text-text">
      {label}
    </label>
  ) : (
    <p className="text-sm font-medium text-text">{label}</p>
  );
  return (
    <div
      className={cn(
        "flex gap-x-6 gap-y-2.5",
        stack
          ? "flex-col"
          : "flex-col sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 sm:flex-1">
        {labelEl}
        {description ? (
          <div className="mt-0.5 text-[13px] text-text-muted">{description}</div>
        ) : null}
      </div>
      {children ? (
        <div className={cn("min-w-0", !stack && "sm:max-w-[22rem] sm:shrink-0")}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A switch row with the same type scale as every other row. */
export function SettingsToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  pending,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        {description ? (
          <div className="mt-0.5 text-[13px] text-text-muted">{description}</div>
        ) : null}
      </div>
      <Toggle
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        pending={pending}
        className="inline-flex shrink-0"
      />
    </div>
  );
}

/**
 * Loading rows shaped like `SettingsRow`s. Put it inside a `SettingsCard`
 * (the section supplies the dividers and padding), never in a card of its own.
 */
export function SettingsRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center justify-between gap-6">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-8 w-28 shrink-0 rounded-lg" />
        </div>
      ))}
    </>
  );
}

/** Inline placeholder for one line of text while its data loads. */
export function InlineSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("inline-block h-3 w-48 max-w-full align-middle", className)} />;
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-danger">
      {children}
    </p>
  );
}

/** Quiet inline tag (soft tint, no border) for the rare state worth naming. */
export function StatusTag({
  tone,
  children,
}: {
  tone: "ok" | "warning" | "muted";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-1.5 text-xs font-medium whitespace-nowrap",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "muted" && "bg-bg-muted text-text-muted",
      )}
    >
      {children}
    </span>
  );
}

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Pulsing block. Respects reduced motion. Decorative (aria-hidden). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-bg-muted motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

/** N lines of text; the last one is shorter. */
export function SkeletonText({
  lines = 2,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Placeholder rows for a DataTable / list (thumbnail + two lines + trailing pill). */
export function SkeletonRows({
  rows = 6,
  className,
  thumbnail = true,
}: {
  rows?: number;
  className?: string;
  thumbnail?: boolean;
}) {
  return (
    <div
      aria-busy
      aria-label="Loading"
      className={cn("divide-y divide-border rounded-xl border border-border bg-bg-elevated", className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          {thumbnail ? <Skeleton className="size-9 shrink-0 rounded-lg" /> : null}
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Card-shaped placeholder (title + body). */
export function SkeletonCard({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div
      aria-busy
      aria-label="Loading"
      className={cn("rounded-xl border border-border bg-bg-elevated p-4", className)}
    >
      <Skeleton className="mb-4 h-4 w-1/3" />
      <SkeletonText lines={lines} />
    </div>
  );
}

/** Page header placeholder matching PageHeader spacing. */
export function SkeletonPageHeader({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("mb-6 space-y-2", className)}>
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-3.5 w-72 max-w-full" />
    </div>
  );
}

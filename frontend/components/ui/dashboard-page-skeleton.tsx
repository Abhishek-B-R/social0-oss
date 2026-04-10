import { cn } from "@/lib/utils";

type DashboardPageSkeletonProps = {
  className?: string;
};

/** Lightweight loading placeholder for dashboard pages that fetch client-side. */
export function DashboardPageSkeleton({ className }: DashboardPageSkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6",
        className,
      )}
      aria-hidden
    >
      <div className="h-8 w-1/3 max-w-[200px] rounded-md bg-bg-subtle" />
      <div className="h-4 w-full rounded-md bg-bg-subtle" />
      <div className="h-4 w-2/3 rounded-md bg-bg-subtle" />
      <div className="h-32 w-full rounded-lg bg-bg-subtle" />
      <div className="h-4 w-full rounded-md bg-bg-subtle" />
      <div className="h-4 w-3/4 rounded-md bg-bg-subtle" />
    </div>
  );
}

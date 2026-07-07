type DashboardPageSkeletonProps = {
  message?: string;
};

export function DashboardPageSkeleton({
  message = "Loading dashboard...",
}: DashboardPageSkeletonProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}

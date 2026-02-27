export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm animate-pulse"
        >
          <div className="h-5 bg-bg-muted rounded w-1/2 mb-4" />
          <div className="h-10 bg-bg-muted rounded-xl w-full" />
        </div>
      ))}
    </div>
  );
}


/** Skeleton for the connected-accounts grid while loading client-side. */
export function AccountsGridSkeleton() {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-between mb-4">
        <div className="h-6 w-24 rounded bg-neutral-300 dark:bg-neutral-600 animate-pulse" />
        <div className="h-9 w-32 rounded-lg bg-neutral-300 dark:bg-neutral-600 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-200/80 dark:bg-neutral-700/80 animate-pulse"
          >
            <div className="size-10 rounded-full bg-neutral-400 dark:bg-neutral-500 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="h-3 w-20 rounded bg-neutral-400 dark:bg-neutral-500" />
              <div className="h-3 w-16 rounded bg-neutral-400 dark:bg-neutral-500" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-text-muted">Loading connected accounts…</p>
    </div>
  );
}

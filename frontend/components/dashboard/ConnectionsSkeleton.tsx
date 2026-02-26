export function ConnectionsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-bg-muted" />
      <div className="h-4 w-full max-w-xl animate-pulse rounded bg-bg-muted" />
      <div className="rounded-2xl border border-border bg-bg-elevated p-3 shadow-sm">
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i}>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-border bg-bg-muted px-2.5 py-1.5">
                <div className="flex w-9 shrink-0 items-center sm:w-28 sm:gap-1.5">
                  <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-bg-muted" />
                  <div className="hidden h-4 w-20 animate-pulse rounded bg-bg-muted sm:block" />
                </div>
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-bg-muted sm:h-7 sm:w-14 sm:rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">
                  <div className="h-6 min-w-16 animate-pulse rounded-md bg-bg-muted" />
                  <div className="h-6 min-w-20 animate-pulse rounded-md bg-bg-muted" />
                  <div className="h-6 min-w-14 animate-pulse rounded-md bg-bg-muted" />
                </div>
              </div>
              {i < 8 && (
                <div className="my-1.5 border-t border-border-subtle" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

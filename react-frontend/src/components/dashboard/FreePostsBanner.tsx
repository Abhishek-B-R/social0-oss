import Link from "next/link";

type FreePostsBannerProps = {
  remaining: number;
  limit: number;
};

export function FreePostsBanner({ remaining, limit }: FreePostsBannerProps) {
  if (remaining <= 0) {
    return (
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          You&apos;ve used all {limit} free posts. Subscribe to keep posting.
        </p>
        <Link
          href="/dashboard/billing"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Upgrade
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-foreground">
        <span className="font-medium">
          {remaining}/{limit} free posts remaining
        </span>
        <span className="text-text-muted"> — lifetime limit on the free plan.</span>
      </p>
      <Link
        href="/dashboard/billing"
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-bg-muted"
      >
        View plans
      </Link>
    </div>
  );
}

import Link from "@/components/AppLink";

export function ConnectAccountsBanner() {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-foreground">
        Connect a social account to start scheduling posts - takes less than a
        minute.
      </p>
      <Link
        href="/dashboard/connections"
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Connect account
      </Link>
    </div>
  );
}

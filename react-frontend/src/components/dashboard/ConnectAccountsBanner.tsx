import Link from "next/link";

export function ConnectAccountsBanner() {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-foreground">
        Connect a social account to start scheduling posts - takes less than a
        minute.
      </p>
      <Link
        href="/dashboard/connections"
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
      >
        Connect account
      </Link>
    </div>
  );
}

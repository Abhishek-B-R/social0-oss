import Link from "@/components/AppLink";
import { useDashboardPath } from "@/lib/dashboard-base-path";

export function ConnectAccountsBanner() {
  const dash = useDashboardPath();
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-foreground">
        Connect a social account to start scheduling posts - takes less than a
        minute.
      </p>
      <Link
        href={dash("connections")}
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Connect account
      </Link>
    </div>
  );
}

import Link from "@/components/AppLink";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { PLATFORM_LABEL } from "@/lib/platforms";
import type {
  InboxFetchError,
  InboxNotice,
  InboxReconnectHint,
} from "@/api/inbox";

type InboxStatusBannersProps = {
  reconnect?: InboxReconnectHint[];
  notices?: InboxNotice[];
  fetchErrors?: InboxFetchError[];
  unsupported?: string[];
};

export function InboxStatusBanners({
  reconnect = [],
  notices = [],
  fetchErrors = [],
  unsupported = [],
}: InboxStatusBannersProps) {
  const dash = useDashboardPath();
  const uniqueUnsupported = [...new Set(unsupported)];

  if (
    !reconnect.length &&
    !notices.length &&
    !fetchErrors.length &&
    !uniqueUnsupported.length
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {reconnect.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">Reconnect for full inbox access</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {reconnect.map((a) => (
              <li key={a.accountId}>
                {PLATFORM_LABEL[a.platform] ?? a.platform}
                {a.username ? ` (@${a.username})` : ""}
              </li>
            ))}
          </ul>
          <Link
            href={dash("connections")}
            className="mt-2 inline-block text-xs font-medium text-accent underline-offset-2 hover:underline"
          >
            Open Connections
          </Link>
        </div>
      ) : null}

      {notices.map((n) => (
        <div
          key={`${n.platform}:${n.message}`}
          className="rounded-lg border border-border bg-bg-muted px-3 py-2 text-sm text-text-muted"
        >
          {PLATFORM_LABEL[n.platform] ?? n.platform}: {n.message}
        </div>
      ))}

      {fetchErrors.map((e) => (
        <div
          key={`${e.accountId}:${e.error}`}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200"
        >
          {PLATFORM_LABEL[e.platform] ?? e.platform}: {e.error}
        </div>
      ))}

      {uniqueUnsupported.length > 0 ? (
        <div className="rounded-lg border border-border bg-bg-muted px-3 py-2 text-sm text-text-muted">
          Comments are not available yet for{" "}
          {uniqueUnsupported
            .map((p) => PLATFORM_LABEL[p] ?? p)
            .join(", ")}
          .
        </div>
      ) : null}
    </div>
  );
}

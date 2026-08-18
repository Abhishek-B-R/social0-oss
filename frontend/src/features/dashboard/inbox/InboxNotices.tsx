import Link from "@/components/AppLink";
import { PLATFORM_LABEL } from "@/lib/platforms";

type ReconnectItem = {
  accountId: string;
  platform: string;
  username: string | null;
};

type FetchError = {
  platform: string;
  error: string;
};

export function InboxReconnectNotice({
  items,
  noun,
  connectionsHref,
}: {
  items: ReconnectItem[];
  noun: string;
  connectionsHref: string;
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
      <span className="font-medium">Reconnect for {noun}: </span>
      {items
        .map(
          (a) =>
            `${PLATFORM_LABEL[a.platform] ?? a.platform}${a.username ? ` @${a.username}` : ""}`,
        )
        .join(" · ")}
      {" · "}
      <Link
        href={connectionsHref}
        className="font-medium text-accent underline-offset-2 hover:underline"
      >
        Connections
      </Link>
    </div>
  );
}

export function InboxFetchErrorsNotice({ errors }: { errors: FetchError[] }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
      <span className="font-medium">Could not load some accounts: </span>
      {errors
        .map((e) => `${PLATFORM_LABEL[e.platform] ?? e.platform} — ${e.error}`)
        .join(" · ")}
    </div>
  );
}

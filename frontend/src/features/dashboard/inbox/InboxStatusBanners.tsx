import { useMemo, useState, type ReactNode } from "react";
import Link from "@/components/AppLink";
import { X } from "@/icons/phosphor";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { cn } from "@/lib/utils";
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
  /** Which pane is showing these - the unsupported copy differs. */
  mode?: "comments" | "dms";
};

export function InboxStatusBanners({
  reconnect = [],
  notices = [],
  fetchErrors = [],
  unsupported = [],
  mode = "comments",
}: InboxStatusBannersProps) {
  const dash = useDashboardPath();
  const uniqueUnsupported = [...new Set(unsupported)];
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const hide = (key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const showReconnect = reconnect.length > 0 && !dismissed.has("reconnect");
  const visibleNotices = useMemo(
    () =>
      notices.filter((n) => !dismissed.has(`notice:${n.platform}:${n.message}`)),
    [notices, dismissed],
  );
  const visibleErrors = useMemo(
    () =>
      fetchErrors.filter(
        (e) => !dismissed.has(`error:${e.accountId}:${e.error}`),
      ),
    [fetchErrors, dismissed],
  );
  const showUnsupported =
    uniqueUnsupported.length > 0 && !dismissed.has("unsupported");

  if (
    !showReconnect &&
    !visibleNotices.length &&
    !visibleErrors.length &&
    !showUnsupported
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {showReconnect ? (
        <DismissibleBanner
          tone="warn"
          onDismiss={() => hide("reconnect")}
        >
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
        </DismissibleBanner>
      ) : null}

      {visibleNotices.map((n) => (
        <DismissibleBanner
          key={`${n.platform}:${n.message}`}
          tone="muted"
          onDismiss={() => hide(`notice:${n.platform}:${n.message}`)}
        >
          {PLATFORM_LABEL[n.platform] ?? n.platform}: {n.message}
        </DismissibleBanner>
      ))}

      {visibleErrors.map((e) => (
        <DismissibleBanner
          key={`${e.accountId}:${e.error}`}
          tone="error"
          onDismiss={() => hide(`error:${e.accountId}:${e.error}`)}
        >
          {PLATFORM_LABEL[e.platform] ?? e.platform}: {e.error}
        </DismissibleBanner>
      ))}

      {showUnsupported ? (
        <DismissibleBanner
          tone="muted"
          onDismiss={() => hide("unsupported")}
        >
          {mode === "dms" ? "Direct messages are" : "Comments are"} not
          available yet for{" "}
          {uniqueUnsupported
            .map((p) => PLATFORM_LABEL[p] ?? p)
            .join(", ")}
          .
        </DismissibleBanner>
      ) : null}
    </div>
  );
}

function DismissibleBanner({
  tone,
  onDismiss,
  children,
}: {
  tone: "warn" | "muted" | "error";
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg border px-3 py-2 pr-9 text-sm",
        tone === "warn" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
        tone === "muted" && "border-border bg-bg-muted text-text-muted",
        tone === "error" &&
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200",
      )}
    >
      {children}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-md text-current opacity-70 transition-[transform,opacity,background-color] duration-150 ease-out touch-manipulation hover:bg-black/10 hover:opacity-100 active:scale-[0.94] touch:h-10 touch:w-10 dark:hover:bg-white/10"
        aria-label="Dismiss"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}

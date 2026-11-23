import { useState } from "react";
import Link from "@/components/AppLink";
import { Banner, networkLabel, useAccountHealth } from "@/components/app";
import { useDashboardPath } from "@/lib/dashboard-base-path";

const DISMISS_KEY = "social0.reconnectBanner.dismissed";

function readDismissed(): string {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Blocking-tier banner: one or more accounts need reconnecting. Shown at the
 * top of every dashboard page except Home (Home lists it in Needs attention).
 * "Later" hides it for this browser session until another account breaks.
 */
export function ReconnectBanner() {
  const { broken, canManageConnections } = useAccountHealth();
  const dash = useDashboardPath();
  const [dismissed, setDismissed] = useState(readDismissed);
  const signature = broken.map((a) => a.id).sort().join(",");

  if (broken.length === 0 || dismissed === signature) return null;

  const first = broken[0]!;
  const them = broken.length === 1 ? "it" : "them";
  const title =
    broken.length === 1
      ? `${networkLabel(first.platform)} ${first.handle} needs reconnecting.`
      : `${broken.length} accounts need reconnecting.`;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, signature);
    } catch {
      /* private mode: dismiss for this render only */
    }
    setDismissed(signature);
  };

  return (
    <Banner
      tier="blocking"
      title={title}
      className="mb-4"
      actions={
        <>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-text-muted hover:bg-black/5 hover:text-text dark:hover:bg-white/10 touch:h-10"
          >
            Later
          </button>
          {broken.length > 1 ? (
            // The other broken accounts, on the Accounts page's Needs attention filter.
            <Link
              href={dash("connections?show=attention")}
              className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-text hover:bg-black/5 dark:hover:bg-white/10 touch:h-10"
            >
              See all {broken.length}
            </Link>
          ) : null}
          {canManageConnections ? (
            // Full navigation: re-auth is an OAuth redirect through the API.
            <a
              href={first.reconnectHref}
              className="inline-flex h-8 items-center rounded-lg bg-text px-3 text-[13px] font-semibold text-bg hover:opacity-90 touch:h-10"
            >
              {broken.length === 1 ? "Reconnect" : `Reconnect ${networkLabel(first.platform)}`}
            </a>
          ) : null}
        </>
      }
    >
      {canManageConnections
        ? `Scheduled posts to ${them} will fail until you do.`
        : `Scheduled posts to ${them} will fail. Ask a workspace admin to reconnect ${them}.`}
    </Banner>
  );
}

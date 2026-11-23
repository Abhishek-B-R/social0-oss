import Link from "@/components/AppLink";
import { NotePencil } from "@/icons/phosphor";
import { Meter } from "@/components/app/Meter";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";
import { useDashboardPath } from "@/lib/dashboard-base-path";

/**
 * Phone-only top bar: workspace switcher (opens a bottom sheet), the Free
 * plan's posts meter (the sidebar meter is desktop-only) and a compose
 * shortcut. Sticky inside the main scroll area.
 */
export function MobileTopBar({
  planName,
  canCreatePosts,
  freePosts = null,
}: {
  planName: string | null;
  canCreatePosts: boolean;
  /** Free plan lifetime posts; null on paid plans and inside workspaces. */
  freePosts?: { remaining: number; limit: number } | null;
}) {
  const dash = useDashboardPath();
  const postsUsed = freePosts
    ? Math.max(0, freePosts.limit - freePosts.remaining)
    : 0;
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-bg/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-bg/75 lg:hidden">
      <WorkspaceSwitcher
        enabled
        planName={planName}
        variant="sheet"
        className="min-w-0"
      />
      <div className="flex shrink-0 items-center gap-1">
        {freePosts ? (
          <Link
            href="/dashboard/billing"
            aria-label={`${postsUsed} of ${freePosts.limit} free posts used. View plans`}
            className="flex min-h-11 w-36 items-center rounded-lg px-2 active:bg-bg-muted"
          >
            <Meter
              value={postsUsed}
              max={freePosts.limit}
              label={`${postsUsed} of ${freePosts.limit} free posts`}
            />
          </Link>
        ) : null}
        {canCreatePosts ? (
          <Link
            href={dash("new")}
            aria-label="New post"
            className="inline-flex size-11 items-center justify-center rounded-lg text-text-muted active:bg-bg-muted"
          >
            <NotePencil size={20} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

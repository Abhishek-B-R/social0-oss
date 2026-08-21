import { SkeletonBone } from "@/components/ui/skeleton-bone";
import { cn } from "@/lib/utils";

function NavBone({ collapsed }: { collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg",
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2",
      )}
    >
      <SkeletonBone className="h-4 w-4 shrink-0 rounded bg-sidebar-active" />
      {!collapsed ? (
        <SkeletonBone className="h-3 w-24 rounded bg-sidebar-active" />
      ) : null}
    </div>
  );
}

function SectionBones({
  title,
  count,
  collapsed,
}: {
  title: string;
  count: number;
  collapsed?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {collapsed ? (
        <div className="mx-auto my-1 h-px w-6 bg-sidebar-border" aria-hidden />
      ) : (
        <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
          {title}
        </p>
      )}
      {Array.from({ length: count }, (_, i) => (
        <NavBone key={i} collapsed={collapsed} />
      ))}
    </div>
  );
}

/** Full dashboard chrome while session resolves - mirrors live sidebar sections. */
export function DashboardShellSkeleton() {
  return (
    <div
      className="dashboard-shell flex h-screen overflow-hidden bg-bg"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <aside
        className="dashboard-sidebar relative z-10 hidden h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg lg:flex"
        data-sidebar="dashboard"
      >
        <div className="flex shrink-0 flex-col gap-4 p-4">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-3 px-2 py-1.5">
              <SkeletonBone className="h-10 w-10 shrink-0 rounded-full bg-sidebar-active" />
              <SkeletonBone className="h-5 w-20 rounded bg-sidebar-active" />
            </div>
            <SkeletonBone className="h-9 w-9 shrink-0 rounded-lg bg-sidebar-active" />
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
              Workspaces
            </p>
            <SkeletonBone className="h-10 w-full rounded-lg bg-sidebar-active" />
          </div>

          <SkeletonBone className="h-11 w-full rounded-xl bg-sidebar-active" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <nav className="flex flex-col gap-6 p-4 pt-0">
            <SectionBones title="Create" count={3} />
            <SectionBones title="Posts" count={7} />
            <SectionBones title="Workspace" count={2} />
          </nav>
        </div>

        <div className="relative z-20 shrink-0 border-t border-sidebar-border bg-sidebar-bg p-4">
          <div className="flex w-full items-center gap-3 rounded-lg px-3 py-2">
            <SkeletonBone className="h-9 w-9 shrink-0 rounded-full bg-sidebar-active" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonBone className="h-3 w-24 rounded bg-sidebar-active" />
              <SkeletonBone className="h-2.5 w-16 rounded bg-sidebar-active/80" />
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-20 lg:pb-0">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] flex-1 flex-col px-3 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:py-8 2xl:max-w-7xl">
          <SkeletonBone className="mb-3 h-9 w-48" />
          <SkeletonBone className="mb-6 h-4 w-72 max-w-full" />
          <SkeletonBone className="min-h-[24rem] flex-1 rounded-xl" />
        </div>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-bg-elevated py-2 pb-[calc(env(safe-area-inset-bottom)+2px)] lg:hidden"
        aria-hidden
      >
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonBone key={i} className="h-8 w-8 rounded-full" />
        ))}
      </nav>
    </div>
  );
}

/** Inline sidebar placeholders for Create / Analytics / Inbox / Workspaces while layout loads. */
export function SidebarNavPendingBones({ collapsed }: { collapsed: boolean }) {
  return (
    <>
      <div
        className={cn(
          "flex shrink-0 flex-col",
          collapsed ? "items-center gap-2 px-2" : "gap-1.5 px-0",
        )}
      >
        {!collapsed ? (
          <p className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
            Workspaces
          </p>
        ) : null}
        <SkeletonBone
          className={cn(
            "rounded-lg bg-sidebar-active",
            collapsed ? "h-9 w-9" : "h-10 w-full",
          )}
        />
      </div>
      <SkeletonBone
        className={cn(
          "rounded-xl bg-sidebar-active",
          collapsed ? "h-9 w-9" : "h-11 w-full",
        )}
      />
    </>
  );
}

export function SidebarCreateSectionBones({
  collapsed,
}: {
  collapsed: boolean;
}) {
  return <SectionBones title="Create" count={3} collapsed={collapsed} />;
}

export function SidebarExtraPostBones({ collapsed }: { collapsed: boolean }) {
  return (
    <>
      <NavBone collapsed={collapsed} />
      <NavBone collapsed={collapsed} />
    </>
  );
}

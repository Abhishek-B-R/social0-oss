import Image from "@/components/AppImage";
import { SkeletonBone } from "@/components/ui/skeleton-bone";
import {
  CalendarDots,
  ChartLine,
  Files,
  GearSix,
  House,
  Lightning,
  Robot,
  SidebarSimple,
  Tray,
} from "@/icons/phosphor";
import { cn } from "@/lib/utils";

type StaticNavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
};

/** Same key as DashboardSidebar, so the skeleton has the rail's real width. */
const SIDEBAR_COLLAPSED_KEY = "social0.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function StaticNavRow({
  label,
  icon: Icon,
  collapsed,
}: StaticNavItem & { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg text-sm font-medium text-sidebar-text",
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-[7px]",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" size={16} />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
    </div>
  );
}

function StaticGroupLabel({ title, collapsed }: { title: string; collapsed: boolean }) {
  if (collapsed) return <div className="mx-auto my-1.5 h-px w-6 bg-sidebar-border" />;
  return (
    <p className="px-3 pb-1 pt-5 text-xs font-medium text-sidebar-muted">
      {title}
    </p>
  );
}

const MAIN_ITEMS: StaticNavItem[] = [
  { label: "Home", icon: House },
  { label: "Inbox", icon: Tray },
  { label: "Calendar", icon: CalendarDots },
  { label: "Posts", icon: Files },
];

const GROW_ITEMS: StaticNavItem[] = [
  { label: "Analytics", icon: ChartLine },
  { label: "Automations", icon: Lightning },
];

const FOOTER_ITEMS: StaticNavItem[] = [
  { label: "AI agents", icon: Robot },
  { label: "Settings", icon: GearSix },
];

/**
 * Full dashboard chrome while the session resolves. Mirrors DashboardSidebar
 * (mock 01·A) so nothing jumps when the real sidebar replaces it.
 */
export function DashboardShellSkeleton() {
  const collapsed = readCollapsed();
  return (
    <div
      className="dashboard-shell flex h-app-shell overflow-hidden bg-bg"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <aside
        className={cn(
          "dashboard-sidebar relative z-10 hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg lg:flex",
          collapsed ? "w-[4.25rem]" : "w-60",
        )}
        data-sidebar="dashboard"
        aria-hidden
      >
        <div
          className={cn(
            "flex shrink-0 gap-1",
            collapsed ? "flex-col items-center p-2 pt-3" : "items-center p-3",
          )}
        >
          <span className="flex shrink-0 items-center justify-center rounded-lg p-1">
            <Image
              src="/logo.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-full object-contain"
            />
          </span>
          {!collapsed ? (
            <SkeletonBone className="h-9 flex-1 rounded-lg bg-sidebar-active" />
          ) : null}
          <span className="h-9 w-9 shrink-0 rounded-lg bg-accent/80" />
        </div>

        <div className={cn("min-h-0 flex-1 overflow-hidden", collapsed ? "px-2 pb-3" : "px-3 pb-3")}>
          <div className="space-y-px">
            {MAIN_ITEMS.map((item) => (
              <StaticNavRow key={item.label} {...item} collapsed={collapsed} />
            ))}
          </div>
          <StaticGroupLabel title="Grow" collapsed={collapsed} />
          <div className="space-y-px">
            {GROW_ITEMS.map((item) => (
              <StaticNavRow key={item.label} {...item} collapsed={collapsed} />
            ))}
          </div>
          <StaticGroupLabel title="Accounts" collapsed={collapsed} />
          <div className="space-y-1.5 px-1 pt-1">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className={cn("flex items-center gap-2.5", collapsed ? "justify-center" : "px-2")}
              >
                <SkeletonBone className="h-6 w-6 shrink-0 rounded-full bg-sidebar-active" />
                {!collapsed ? (
                  <SkeletonBone className="h-3 w-24 rounded bg-sidebar-active" />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "relative z-20 shrink-0 border-t border-sidebar-border bg-sidebar-bg",
            collapsed ? "space-y-1 p-2" : "space-y-px p-3",
          )}
        >
          {FOOTER_ITEMS.map((item) => (
            <StaticNavRow key={item.label} {...item} collapsed={collapsed} />
          ))}
          <div className={cn("flex items-center gap-1 pt-1", collapsed && "flex-col")}>
            <div
              className={cn(
                "flex min-w-0 flex-1 items-center",
                collapsed ? "justify-center p-1" : "gap-3 px-3 py-2",
              )}
            >
              <SkeletonBone className="h-8 w-8 shrink-0 rounded-full bg-sidebar-active" />
              {!collapsed ? (
                <SkeletonBone className="h-3 w-24 rounded bg-sidebar-active" />
              ) : null}
            </div>
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-muted">
              <SidebarSimple size={18} />
            </span>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] flex-1 flex-col px-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-bottom-nav pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-4 sm:pr-6 sm:pt-6 lg:px-8 lg:py-8 lg:pb-8 2xl:max-w-7xl">
          <SkeletonBone className="mb-3 h-9 w-48" />
          <SkeletonBone className="mb-6 h-4 w-72 max-w-full" />
          <SkeletonBone className="min-h-[24rem] flex-1 rounded-xl" />
        </div>
      </main>

      {/* Must match DashboardBottomNav's box exactly — same height token,
          same safe-area padding — or the shell shifts under the user when
          the real nav replaces it. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
        aria-hidden
      >
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="flex h-[var(--bottom-nav-h)] flex-1 flex-col items-center justify-center gap-1"
          >
            <SkeletonBone className="h-5 w-5 rounded-md" />
            <SkeletonBone className="h-2 w-10 rounded" />
          </div>
        ))}
      </nav>
    </div>
  );
}

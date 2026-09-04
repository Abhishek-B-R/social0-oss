import Image from "@/components/AppImage";
import { SkeletonBone } from "@/components/ui/skeleton-bone";
import {
  CalendarDots,
  ChartLine,
  ChatCircle,
  CheckCircle,
  Clock,
  List,
  NoteBlank,
  Pencil,
  PlugsConnected,
  SidebarSimple,
  Sliders,
  Stack,
  Users,
} from "@/icons/phosphor";
import { cn } from "@/lib/utils";

type StaticNavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  experimental?: boolean;
};

function StaticNavRow({ label, icon: Icon, experimental }: StaticNavItem) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-text">
      <Icon className="h-4 w-4 shrink-0 text-sidebar-text" size={16} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {experimental ? (
        <span className="shrink-0 rounded bg-sidebar-active px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
          Beta
        </span>
      ) : null}
    </div>
  );
}

function StaticSection({
  title,
  items,
}: {
  title: string;
  items: StaticNavItem[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
        {title}
      </p>
      {items.map((item) => (
        <StaticNavRow key={item.label} {...item} />
      ))}
    </div>
  );
}

const CREATE_ITEMS: StaticNavItem[] = [
  { label: "Composer", icon: Pencil },
  { label: "Manual setup", icon: Sliders },
  { label: "Bulk tools", icon: Stack },
];

const POST_ITEMS: StaticNavItem[] = [
  { label: "All", icon: List },
  { label: "Posted", icon: CheckCircle },
  { label: "Scheduled", icon: Clock },
  { label: "Drafts", icon: NoteBlank },
  { label: "Calendar", icon: CalendarDots },
  { label: "Analytics", icon: ChartLine, experimental: true },
  { label: "Inbox", icon: ChatCircle, experimental: true },
];

const WORKSPACE_ITEMS: StaticNavItem[] = [
  { label: "Connections", icon: PlugsConnected },
  { label: "Teams", icon: Users },
];

/** Full dashboard chrome while session resolves - static sidebar, skeleton only for dynamic bits. */
export function DashboardShellSkeleton() {
  return (
    <div
      className="dashboard-shell flex h-app-shell overflow-hidden bg-bg"
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
              <Image
                src="/logo.png"
                alt="Social0"
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-full border border-white object-contain"
              />
              <span className="font-logo text-[22px] font-normal tracking-tight text-foreground landing">
                Social0
              </span>
            </div>
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-muted"
              aria-hidden
            >
              <SidebarSimple size={18} weight="regular" />
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
              Workspaces
            </p>
            <SkeletonBone className="h-10 w-full rounded-lg bg-sidebar-active" />
          </div>

          <div
            className={cn(
              "sidebar-create-post-cta flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm",
            )}
          >
            Create post
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <nav className="flex flex-col gap-6 p-4 pt-0">
            <StaticSection title="Create" items={CREATE_ITEMS} />
            <StaticSection title="Posts" items={POST_ITEMS} />
            <StaticSection title="Workspace" items={WORKSPACE_ITEMS} />
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

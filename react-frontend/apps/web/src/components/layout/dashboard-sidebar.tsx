import { Link, useRouterState } from "@tanstack/react-router";
import {
  IconCalendar,
  IconCreditCard,
  IconLayoutGrid,
  IconLink,
  IconPencil,
  IconSettings,
  IconStack2,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard/composer", label: "Composer", icon: IconPencil },
  { to: "/dashboard/create", label: "Create", icon: IconLayoutGrid },
  { to: "/dashboard/posts", label: "Posts", icon: IconStack2 },
  { to: "/dashboard/calendar", label: "Calendar", icon: IconCalendar },
  { to: "/dashboard/connections", label: "Connections", icon: IconLink },
  { to: "/dashboard/billing", label: "Billing", icon: IconCreditCard },
  { to: "/dashboard/settings", label: "Settings", icon: IconSettings },
];

export function DashboardSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar-bg md:flex md:flex-col">
      <div className="border-b border-sidebar-border px-4 py-5">
        <Link to="/dashboard" className="text-lg font-semibold text-accent">
          Social0
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {nav.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-active font-medium text-sidebar-text"
                  : "text-sidebar-muted hover:bg-sidebar-active/60 hover:text-sidebar-text",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

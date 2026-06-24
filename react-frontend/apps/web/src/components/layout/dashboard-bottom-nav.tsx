import { Link, useRouterState } from "@tanstack/react-router";
import { IconCalendar, IconHome, IconLink, IconPencil } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dashboard/composer", label: "Compose", icon: IconPencil },
  { to: "/dashboard/posts", label: "Posts", icon: IconHome },
  { to: "/dashboard/calendar", label: "Calendar", icon: IconCalendar },
  { to: "/dashboard/connections", label: "Connect", icon: IconLink },
];

export function DashboardBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-elevated md:hidden">
      <div className="grid grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-xs",
                active ? "text-accent" : "text-text-muted",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

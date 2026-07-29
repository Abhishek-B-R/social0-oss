import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { useState } from "react";
import {
  CalendarDots,
  DotsThree,
  PlugsConnected,
  Rows,
} from "@/icons/phosphor";
import { TiktokCreateButton } from "./TiktokCreateButton";
import {
  getDashboardRelativePath,
  useDashboardPath,
} from "@/lib/dashboard-base-path";

type NavItemIcon = React.ComponentType<{
  className?: string;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}>;

export function DashboardBottomNav() {
  const pathname = useLocation().pathname;
  const dash = useDashboardPath();
  const relative = getDashboardRelativePath(pathname);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [pendingPath, setPendingPath] = useState(pathname);
  if (pendingPath !== pathname) {
    setPendingPath(pathname);
    setPendingHref(null);
  }

  const createHref = dash("composer");

  const navItems: Array<{
    href: string;
    label: string;
    icon?: NavItemIcon;
    key: string;
  }> = [
    { key: "posts", href: dash("posts"), label: "Posts", icon: Rows },
    {
      key: "calendar",
      href: dash("calendar"),
      label: "Calendar",
      icon: CalendarDots,
    },
    { key: "create", href: createHref, label: "Create" },
    {
      key: "connections",
      href: dash("connections"),
      label: "Connections",
      icon: PlugsConnected,
    },
    {
      key: "more",
      href: "/dashboard/more",
      label: "More",
      icon: DotsThree,
    },
  ];

  const isActive = (key: string) => {
    if (key === "connections") return relative === "connections";
    if (key === "create")
      return relative === "composer" || relative.startsWith("create");
    if (key === "calendar") return relative.startsWith("calendar");
    if (key === "posts")
      return (
        relative === "posts" ||
        relative.startsWith("posts/scheduled") ||
        relative.startsWith("posts/posted") ||
        relative.startsWith("posts/drafts")
      );
    if (key === "more")
      return (
        pathname === "/dashboard/more" ||
        pathname.startsWith("/dashboard/billing") ||
        pathname.startsWith("/dashboard/api-keys") ||
        pathname.startsWith("/dashboard/feedback") ||
        (pathname.startsWith("/dashboard/teams") &&
          !pathname.match(/\/teams\/[^/]+\/(composer|create|posts|calendar|connections)/)) ||
        pathname.startsWith("/dashboard/workspaces") ||
        (relative === "settings" && pathname.includes("/dashboard/settings"))
      );
    return false;
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-bg-elevated py-0.5 pb-[calc(env(safe-area-inset-bottom)+2px)] lg:hidden"
      aria-label="Main navigation"
    >
      {navItems.map(({ href, label, icon: Icon, key }) => {
        const active = isActive(key);
        const isCreate = key === "create";

        if (isCreate) {
          return (
            <div key={key} className="relative flex min-h-[60px] flex-1 shrink-0">
              <TiktokCreateButton
                href={href}
                isActive={active}
                label={label}
              />
            </div>
          );
        }

        return (
          <Link
            key={key}
            href={href}
            prefetch
            onClick={() => {
              if (!active) setPendingHref(href);
            }}
            className={`flex min-h-[60px] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 px-1 pb-2.5 pt-2 text-xs transition-colors touch-manipulation ${
              active
                ? "text-accent"
                : "text-text-muted hover:text-text active:text-text"
            } ${pendingHref === href ? "opacity-60" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {Icon && (
              <Icon
                className="h-5 w-5 shrink-0"
                size={20}
                weight={active ? "fill" : "regular"}
              />
            )}
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

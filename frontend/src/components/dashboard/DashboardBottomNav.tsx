import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { useState } from "react";
import {
  CalendarDots,
  DotsThree,
  PlugsConnected,
  List,
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

export function DashboardBottomNav({
  canCreatePosts = true,
}: {
  canCreatePosts?: boolean;
}) {
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
    { key: "posts", href: dash("posts"), label: "Posts", icon: List },
    {
      key: "calendar",
      href: dash("calendar"),
      label: "Calendar",
      icon: CalendarDots,
    },
    ...(canCreatePosts
      ? [{ key: "create", href: createHref, label: "Create" }]
      : []),
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
          !pathname.match(/\/teams\/[^/]+\/(composer|create|posts|calendar|connections|inbox|analytics)/)) ||
        pathname.startsWith("/dashboard/workspaces") ||
        (relative === "settings" && pathname.includes("/dashboard/settings"))
      );
    return false;
  };

  return (
    // Height comes from --bottom-nav-h so page bottom clearance
    // (.pb-bottom-nav) can never drift from the real tab bar. The safe-area
    // inset is *padding below* that row, keeping tap targets clear of the
    // iOS gesture bar, and the x-insets keep the outer tabs off the notch
    // in landscape.
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
      aria-label="Main navigation"
    >
      {navItems.map(({ href, label, icon: Icon, key }) => {
        const active = isActive(key);
        const isCreate = key === "create";

        if (isCreate) {
          return (
            <div
              key={key}
              className="relative flex h-[var(--bottom-nav-h)] flex-1 shrink-0 items-center justify-center"
            >
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
            className={`flex h-[var(--bottom-nav-h)] flex-1 shrink-0 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none transition-colors touch-manipulation ${
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
            <span className="w-full truncate text-center">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

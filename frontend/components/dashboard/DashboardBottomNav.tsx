"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FilePlus,
  List,
  Link2,
  MoreHorizontal,
  Calendar,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard/connections", label: "Connections", icon: Link2 },
  { href: "/dashboard/posts", label: "Posts", icon: List },
  { href: "/dashboard/composer", label: "Create", icon: FilePlus },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/more", label: "More", icon: MoreHorizontal },
] as const;

export function DashboardBottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard/connections")
      return pathname === "/dashboard/connections";
    if (href === "/dashboard/composer")
      return (
        pathname === "/dashboard/composer" ||
        pathname.startsWith("/dashboard/create/")
      );
    if (href === "/dashboard/calendar")
      return pathname.startsWith("/dashboard/calendar");
    if (href === "/dashboard/posts")
      return (
        pathname === "/dashboard/posts" ||
        pathname.startsWith("/dashboard/posts/scheduled") ||
        pathname.startsWith("/dashboard/posts/posted") ||
        pathname.startsWith("/dashboard/posts/drafts")
      );
    if (href === "/dashboard/more")
      return (
        pathname === "/dashboard/more" ||
        pathname.startsWith("/dashboard/settings") ||
        pathname.startsWith("/dashboard/billing") ||
        pathname.startsWith("/dashboard/bulk-tools") ||
        pathname.startsWith("/dashboard/teams")
      );
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        const isCreate = href === "/dashboard/composer";

        if (isCreate) {
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-0.5 py-3 pt-2"
            >
              <span
                className={`flex flex-col items-center gap-0.5 rounded-full px-2.5 py-1 shadow-sm transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "bg-bg-muted text-text-muted hover:bg-accent/20 hover:text-accent"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-xs font-medium leading-tight">{label}</span>
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-3 pt-2 text-xs transition-colors ${
              active ? "text-accent" : "text-text-muted hover:text-text"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

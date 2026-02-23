"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePlus, List, Link2, MoreHorizontal } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard/connections", label: "Connections", icon: Link2 },
  { href: "/dashboard/posts", label: "Posts", icon: List },
  { href: "/dashboard/posts/new", label: "Create", icon: FilePlus },
  { href: "/dashboard/more", label: "More", icon: MoreHorizontal },
] as const;

export function DashboardBottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard/connections") return pathname === "/dashboard/connections";
    if (href === "/dashboard/posts/new")
      return (
        pathname === "/dashboard/posts/new" ||
        pathname.startsWith("/dashboard/posts/new/")
      );
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
        pathname.startsWith("/dashboard/calendar") ||
        pathname.startsWith("/dashboard/teams")
      );
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-3 pt-2 text-xs transition-colors ${
              active ? "text-emerald-600" : "text-gray-500 hover:text-gray-900"
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

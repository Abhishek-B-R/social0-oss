
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { useEffect, useState } from "react";
import {
  IconList,
  IconLink,
  IconDots,
  IconCalendar,
} from "@tabler/icons-react";
import { TiktokCreateButton } from "./TiktokCreateButton";

const CREATE_HREF = "/dashboard/composer";

type NavItemIcon = React.ComponentType<{ className?: string }>;

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon?: NavItemIcon;
}> = [
  { href: "/dashboard/posts", label: "Posts", icon: IconList },
  { href: "/dashboard/calendar", label: "Calendar", icon: IconCalendar },
  { href: CREATE_HREF, label: "Create" },
  { href: "/dashboard/connections", label: "Connections", icon: IconLink },
  { href: "/dashboard/more", label: "More", icon: IconDots },
];

export function DashboardBottomNav() {
  const pathname = useLocation().pathname;
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

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
        pathname.startsWith("/dashboard/bulk-tools")
        // || pathname.startsWith("/dashboard/teams") // hidden until Teams ships
      );
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-bg-elevated py-0.5 pb-[calc(env(safe-area-inset-bottom)+2px)] lg:hidden"
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        const isCreate = href === CREATE_HREF;

        if (isCreate) {
          return (
            <div key={href} className="relative flex min-h-[60px] flex-1 shrink-0">
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
            key={href}
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
            {Icon && <Icon className="h-5 w-5 shrink-0" />}
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

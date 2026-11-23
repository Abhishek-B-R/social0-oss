import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { useState, type ComponentType } from "react";
import { CalendarDots, DotsThree, Files, House, Tray } from "@/icons/phosphor";
import { TiktokCreateButton } from "./TiktokCreateButton";
import {
  getDashboardRelativePath,
  useDashboardPath,
} from "@/lib/dashboard-base-path";
import { cn } from "@/lib/utils";
import { formatBadgeCount, useInboxNeedsReplyCount } from "@/components/app";

type NavItemIcon = ComponentType<{
  className?: string;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}>;

/** Pages reached from More: the More tab lights up on them. */
const MORE_SECTIONS = [
  "more",
  "posts",
  "analytics",
  "automations",
  "bulk-tools",
  "connections",
  "connect",
  "agents",
  "api-keys",
  "settings",
  "billing",
  "teams",
  "workspaces",
  "feedback",
];

/**
 * Mobile tab bar by daily job: Home · Calendar · Create (raised) · Inbox
 * (needs-reply badge) · More.
 * Roles without inbox access get Posts in that slot; roles that can't
 * publish lose Create.
 */
export function DashboardBottomNav({
  canCreatePosts = true,
  canViewInbox = true,
}: {
  canCreatePosts?: boolean;
  canViewInbox?: boolean;
}) {
  const pathname = useLocation().pathname;
  const dash = useDashboardPath();
  const relative = getDashboardRelativePath(pathname);
  const first = relative.split("/")[0] ?? "";
  const needsReply = useInboxNeedsReplyCount();
  const inboxBadge = canViewInbox && needsReply ? needsReply : null;
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [pendingPath, setPendingPath] = useState(pathname);
  if (pendingPath !== pathname) {
    setPendingPath(pathname);
    setPendingHref(null);
  }

  const items: Array<{
    key: string;
    href: string;
    label: string;
    icon?: NavItemIcon;
    badge?: number | null;
  }> = [
    { key: "home", href: dash("home"), label: "Home", icon: House },
    { key: "calendar", href: dash("calendar"), label: "Calendar", icon: CalendarDots },
    ...(canCreatePosts ? [{ key: "create", href: dash("new"), label: "Create" }] : []),
    canViewInbox
      ? { key: "inbox", href: dash("inbox"), label: "Inbox", icon: Tray, badge: inboxBadge }
      : { key: "posts", href: dash("posts"), label: "Posts", icon: Files },
    { key: "more", href: dash("more"), label: "More", icon: DotsThree },
  ];

  const isActive = (key: string) => {
    if (key === "create") return ["new", "composer", "create"].includes(first);
    if (key === "more") {
      if (!canViewInbox && first === "posts") return false;
      return MORE_SECTIONS.includes(first);
    }
    return first === key;
  };

  return (
    // Height comes from --bottom-nav-h so page bottom clearance
    // (.pb-bottom-nav) can never drift from the real tab bar.
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
      aria-label="Main navigation"
    >
      {items.map(({ href, label, icon: Icon, key, badge }) => {
        const active = isActive(key);
        if (key === "create") {
          return (
            <div
              key={key}
              className="relative flex h-[var(--bottom-nav-h)] flex-1 shrink-0 items-center justify-center"
            >
              <TiktokCreateButton href={href} isActive={active} label="Create" aria-label="New post" />
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
            className={cn(
              "flex h-[var(--bottom-nav-h)] flex-1 shrink-0 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none transition-colors touch-manipulation",
              active ? "text-accent" : "text-text-muted hover:text-text active:text-text",
              pendingHref === href && "opacity-60",
            )}
            aria-current={active ? "page" : undefined}
            aria-label={badge ? `${label}, ${badge} ${badge === 1 ? "needs" : "need"} a reply` : undefined}
          >
            {Icon ? (
              <span className="relative inline-flex">
                <Icon className="h-5 w-5 shrink-0" size={20} weight={active ? "fill" : "regular"} />
                {badge ? (
                  <span
                    aria-hidden
                    className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground ring-2 ring-bg-elevated"
                  >
                    {formatBadgeCount(badge)}
                  </span>
                ) : null}
              </span>
            ) : null}
            <span className="w-full truncate text-center">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

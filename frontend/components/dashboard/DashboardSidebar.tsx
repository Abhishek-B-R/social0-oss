"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  IconFilePlus,
  IconPencil,
  IconStack2,
  IconClock,
  IconFileText,
  IconCalendar,
  IconLink,
  IconUsers,
  IconSettings,
  IconWallet,
  IconMessageCircle,
  IconChevronDown,
  IconTool,
  IconList,
  IconCircleCheck,
  IconBrandX,
  IconBook2,
} from "@tabler/icons-react";
import { SignOutButton } from "@/components/SignOutButton";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
}: NavItem & { isActive: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-sidebar-text hover:bg-sidebar-active ${
        isActive ? "bg-sidebar-active" : ""
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 text-sidebar-text" />
      {label}
    </Link>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

type DashboardSidebarProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  planLabel: string;
};

export function DashboardSidebar({ user, planLabel }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  const isDark = mounted && resolvedTheme === "dark";
  const logoSrc = isDark ? "/logo-dark.png" : "/logo-circular.png";

  const isActive = (href: string) => {
    if (href === "/dashboard/connections")
      return pathname === "/dashboard/connections";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className="dashboard-sidebar hidden h-full w-60 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar-bg lg:flex"
      data-sidebar="dashboard"
    >
      {/* Sticky top: logo + Create post */}
      <div className="flex shrink-0 flex-col gap-4 p-4">
        <Link
          href="/dashboard/composer"
          className="flex items-center gap-3 rounded-lg px-3 py-2 font-semibold text-lg text-sidebar-text hover:bg-sidebar-active transition-colors"
        >
          <Image
            src={logoSrc}
            alt="Social0"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full object-contain border border-white"
          />
          <span className="font-serif text-[22px] tracking-tight text-foreground landing">
            Social0
          </span>
        </Link>

        {/* <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <Home className="h-4 w-4 shrink-0 text-gray-500" />
          <span className="flex-1 text-sm font-medium text-gray-700">main</span>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </div> */}

        <Link
          href="/dashboard/composer"
          className="sidebar-create-post-cta flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover transition-colors"
        >
          <IconFilePlus className="h-4 w-4 shrink-0" size={16} />
          Create post
        </Link>
      </div>

      {/* Scrollable middle: nav */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <nav className="flex flex-col gap-6 p-4 pt-0">
          <Section title="Create">
            <NavLink
              href="/dashboard/composer"
              label="Composer"
              icon={IconPencil}
              isActive={pathname.startsWith("/dashboard/composer")}
            />
            <NavLink
              href="/dashboard/create"
              label="Manual setup"
              icon={IconTool}
              isActive={
                pathname === "/dashboard/create" ||
                pathname.startsWith("/dashboard/create/")
              }
            />
            <NavLink
              href="/dashboard/bulk-tools"
              label="Bulk tools"
              icon={IconStack2}
              isActive={isActive("/dashboard/bulk-tools")}
            />
          </Section>

          <Section title="Posts">
            <NavLink
              href="/dashboard/posts"
              label="All"
              icon={IconList}
              isActive={pathname === "/dashboard/posts"}
            />
            <NavLink
              href="/dashboard/posts/posted"
              label="Posted"
              icon={IconCircleCheck}
              isActive={isActive("/dashboard/posts/posted")}
            />
            <NavLink
              href="/dashboard/posts/scheduled"
              label="Scheduled"
              icon={IconClock}
              isActive={isActive("/dashboard/posts/scheduled")}
            />
            <NavLink
              href="/dashboard/posts/drafts"
              label="Drafts"
              icon={IconFileText}
              isActive={isActive("/dashboard/posts/drafts")}
            />
            <NavLink
              href="/dashboard/calendar"
              label="Calendar"
              icon={IconCalendar}
              isActive={isActive("/dashboard/calendar")}
            />
          </Section>

          <Section title="Workspace">
            <NavLink
              href="/dashboard/connections"
              label="Connections"
              icon={IconLink}
              isActive={pathname === "/dashboard/connections"}
            />
            <NavLink
              href="/dashboard/teams"
              label="Teams"
              icon={IconUsers}
              isActive={isActive("/dashboard/teams")}
            />
          </Section>

          <Section title="Configuration">
            <NavLink
              href="/dashboard/settings"
              label="Settings"
              icon={IconSettings}
              isActive={isActive("/dashboard/settings")}
            />
            <NavLink
              href="/dashboard/billing"
              label="Billing"
              icon={IconWallet}
              isActive={isActive("/dashboard/billing")}
            />
          </Section>

          <Section title="Support">
            <NavLink
              href="/dashboard/feedback"
              label="Feedback"
              icon={IconMessageCircle}
              isActive={isActive("/dashboard/feedback")}
            />
          </Section>

          <Section title="Resources">
            <a
              href="https://x.com/social0_app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-sidebar-text hover:bg-sidebar-active"
            >
              <IconBrandX className="h-4 w-4 shrink-0 text-sidebar-text" />
              Latest updates
            </a>
            <a
              href="https://docs.social0.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-sidebar-text hover:bg-sidebar-active"
            >
              <IconBook2 className="h-4 w-4 shrink-0 text-sidebar-text" />
              Docs
            </a>
          </Section>
        </nav>
      </div>

      {/* Sticky bottom: user menu (closed by default; Sign out on click) */}
      <div
        ref={userMenuRef}
        className="shrink-0 border-t border-sidebar-border bg-sidebar-bg p-4"
      >
        <button
          type="button"
          onClick={() => setUserMenuOpen((o) => !o)}
          className="sidebar-user-block flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-active"
          aria-expanded={userMenuOpen}
          aria-haspopup="true"
          aria-label={userMenuOpen ? "Close account menu" : "Open account menu"}
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={user.name || "User"}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
              {(user.name || user.email || "U").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-text">
              {user.name || user.email || "User"}
            </p>
            <p className="truncate text-xs text-sidebar-text">{planLabel}</p>
          </div>
          <IconChevronDown
            className={`h-4 w-4 shrink-0 text-sidebar-text transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
            size={16}
          />
        </button>
        {userMenuOpen && (
          <div className="mt-2">
            <SignOutButton />
          </div>
        )}
      </div>
    </aside>
  );
}

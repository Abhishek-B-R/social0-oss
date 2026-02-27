"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  FilePlus,
  Layers,
  Calendar,
  List,
  Clock,
  CheckCircle,
  FileText,
  Link2,
  Users,
  Settings,
  CreditCard,
  MessageCircle,
  ChevronDown,
} from "lucide-react";
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
};

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const logoSrc = isDark ? "/logo-dark.png" : "/logo-circular.png";

  const isActive = (href: string) => {
    if (href === "/dashboard/connections")
      return pathname === "/dashboard/connections";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className="dashboard-sidebar hidden h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar-bg lg:flex"
      data-sidebar="dashboard"
    >
      <div className="flex flex-col gap-6 p-4">
        <Link
          href="/dashboard/create"
          className="flex items-center gap-3 rounded-lg px-3 py-2 font-semibold text-lg text-sidebar-text hover:bg-sidebar-active transition-colors"
        >
          <Image
            src={logoSrc}
            alt="Social0"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full object-contain"
          />
          <span>Social0</span>
        </Link>

        {/* <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <Home className="h-4 w-4 shrink-0 text-gray-500" />
          <span className="flex-1 text-sm font-medium text-gray-700">main</span>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </div> */}

        <Link
          href="/dashboard/create"
          className="sidebar-create-post-cta flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent-hover transition-colors"
        >
          <FilePlus className="h-4 w-4 shrink-0" />
          Create post
        </Link>

        <nav className="flex flex-1 flex-col gap-6">
          <Section title="Create">
            <NavLink
              href="/dashboard/create"
              label="New post"
              icon={FilePlus}
              isActive={
                pathname === "/dashboard/create" ||
                pathname.startsWith("/dashboard/create/")
              }
            />
            <NavLink
              href="/dashboard/bulk-tools"
              label="Bulk tools"
              icon={Layers}
              isActive={isActive("/dashboard/bulk-tools")}
            />
          </Section>

          <Section title="Posts">
            <NavLink
              href="/dashboard/posts"
              label="All"
              icon={List}
              isActive={pathname === "/dashboard/posts"}
            />
            <NavLink
              href="/dashboard/posts/posted"
              label="Posted"
              icon={CheckCircle}
              isActive={isActive("/dashboard/posts/posted")}
            />
            <NavLink
              href="/dashboard/posts/scheduled"
              label="Scheduled"
              icon={Clock}
              isActive={isActive("/dashboard/posts/scheduled")}
            />
            <NavLink
              href="/dashboard/posts/drafts"
              label="Drafts"
              icon={FileText}
              isActive={isActive("/dashboard/posts/drafts")}
            />
            <NavLink
              href="/dashboard/calendar"
              label="Calendar"
              icon={Calendar}
              isActive={isActive("/dashboard/calendar")}
            />
          </Section>

          <Section title="Workspace">
            <NavLink
              href="/dashboard/connections"
              label="Connections"
              icon={Link2}
              isActive={pathname === "/dashboard/connections"}
            />
            <NavLink
              href="/dashboard/teams"
              label="Teams"
              icon={Users}
              isActive={isActive("/dashboard/teams")}
            />
          </Section>

          <Section title="Configuration">
            <NavLink
              href="/dashboard/settings"
              label="Settings"
              icon={Settings}
              isActive={isActive("/dashboard/settings")}
            />
            <NavLink
              href="/dashboard/billing"
              label="Billing"
              icon={CreditCard}
              isActive={isActive("/dashboard/billing")}
            />
          </Section>

          <Section title="Support">
            <a
              href="#"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-sidebar-text hover:bg-sidebar-active"
            >
              <MessageCircle className="h-4 w-4 shrink-0 text-sidebar-text" />
              Share feedback
            </a>
          </Section>
        </nav>
      </div>

      <div className="border-t border-sidebar-border p-4">
        <div className="sidebar-user-block flex items-center gap-3 rounded-lg px-3 py-2">
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
            <p className="truncate text-xs text-sidebar-text">Creator Plan</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-sidebar-text" />
        </div>
        <div className="mt-2">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

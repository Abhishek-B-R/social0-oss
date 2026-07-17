/* eslint-disable react-hooks/set-state-in-effect */
import { useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import Image from "@/components/AppImage";
import Link from "@/components/AppLink";
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
  IconHome,
  IconKey,
} from "@tabler/icons-react";
import { SignOutButton } from "@/components/SignOutButton";
import { signInUrl } from "@/lib/sign-in-url";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";
import {
  getDashboardRelativePath,
  getTeamIdFromPathname,
  isTeamAppPath,
  useDashboardPath,
} from "@/lib/dashboard-base-path";

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
  const pathname = useLocation().pathname;
  const [navPending, setNavPending] = useState(false);
  useEffect(() => {
    setNavPending(false);
  }, [pathname]);
  return (
    <Link
      href={href}
      prefetch
      onClick={() => {
        if (!isActive) setNavPending(true);
      }}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-sidebar-text hover:bg-sidebar-active ${
        isActive ? "bg-sidebar-active" : ""
      } ${navPending ? "opacity-60" : ""}`}
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
  } | null;
  planLabel: string;
  isGuest?: boolean;
  sessionPending?: boolean;
};

function relativeMatches(
  relative: string,
  target: string,
  opts?: { exact?: boolean },
) {
  if (opts?.exact) return relative === target;
  return relative === target || relative.startsWith(`${target}/`);
}

export function DashboardSidebar({
  user,
  planLabel,
  isGuest = false,
  sessionPending = false,
}: DashboardSidebarProps) {
  const pathname = useLocation().pathname;
  const dash = useDashboardPath();
  const relative = getDashboardRelativePath(pathname);
  const inTeamApp = isTeamAppPath(pathname);
  const teamId = getTeamIdFromPathname(pathname);
  const onTeamSettings = !!teamId && pathname.includes(`/teams/${teamId}/settings`);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [logoPending, setLogoPending] = useState(false);
  const [composerCtaPending, setComposerCtaPending] = useState(false);
  const [landingPending, setLandingPending] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLogoPending(false);
    setComposerCtaPending(false);
    setLandingPending(false);
  }, [pathname]);

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

  const logoSrc =
    mounted && resolvedTheme === "dark" ? "/logo-dark.png" : "/logo.png";

  return (
    <aside
      className="dashboard-sidebar hidden h-full w-60 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar-bg lg:flex"
      data-sidebar="dashboard"
    >
      <div className="flex shrink-0 flex-col gap-4 p-4">
        <Link
          href={dash("composer")}
          prefetch
          onClick={() => {
            if (!relativeMatches(relative, "composer", { exact: true }))
              setLogoPending(true);
          }}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 font-semibold text-lg text-sidebar-text hover:bg-sidebar-active transition-colors ${logoPending ? "opacity-60" : ""}`}
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

        {!isGuest && !sessionPending ? (
          <WorkspaceSwitcher enabled={!!user} />
        ) : null}

        <Link
          href={dash("composer")}
          prefetch
          onClick={() => {
            if (!relativeMatches(relative, "composer", { exact: true }))
              setComposerCtaPending(true);
          }}
          className={`sidebar-create-post-cta flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent-hover transition-colors ${composerCtaPending ? "opacity-80" : ""}`}
        >
          <IconFilePlus className="h-4 w-4 shrink-0" size={16} />
          Create post
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <nav className="flex flex-col gap-6 p-4 pt-0">
          <Section title="Create">
            <NavLink
              href={dash("composer")}
              label="Composer"
              icon={IconPencil}
              isActive={relativeMatches(relative, "composer", { exact: true })}
            />
            <NavLink
              href={dash("create")}
              label="Manual setup"
              icon={IconTool}
              isActive={relativeMatches(relative, "create")}
            />
            <NavLink
              href={dash("bulk-tools")}
              label="Bulk tools"
              icon={IconStack2}
              isActive={relativeMatches(relative, "bulk-tools")}
            />
          </Section>

          <Section title="Posts">
            <NavLink
              href={dash("posts")}
              label="All"
              icon={IconList}
              isActive={relative === "posts"}
            />
            <NavLink
              href={dash("posts/posted")}
              label="Posted"
              icon={IconCircleCheck}
              isActive={relativeMatches(relative, "posts/posted")}
            />
            <NavLink
              href={dash("posts/scheduled")}
              label="Scheduled"
              icon={IconClock}
              isActive={relativeMatches(relative, "posts/scheduled")}
            />
            <NavLink
              href={dash("posts/drafts")}
              label="Drafts"
              icon={IconFileText}
              isActive={relativeMatches(relative, "posts/drafts")}
            />
            <NavLink
              href={dash("calendar")}
              label="Calendar"
              icon={IconCalendar}
              isActive={relativeMatches(relative, "calendar")}
            />
          </Section>

          <Section title="Workspace">
            <NavLink
              href={dash("connections")}
              label="Connections"
              icon={IconLink}
              isActive={relative === "connections"}
            />
            {inTeamApp || onTeamSettings ? (
              <NavLink
                href={`/dashboard/teams/${teamId}/settings`}
                label="Team settings"
                icon={IconUsers}
                isActive={onTeamSettings}
              />
            ) : (
              <NavLink
                href="/dashboard/teams"
                label="Teams"
                icon={IconUsers}
                isActive={
                  pathname === "/dashboard/teams" ||
                  pathname.startsWith("/dashboard/teams/create")
                }
              />
            )}
          </Section>

          <Section title="Configuration">
            <NavLink
              href="/dashboard/settings"
              label="Settings"
              icon={IconSettings}
              isActive={pathname.startsWith("/dashboard/settings")}
            />
            <NavLink
              href="/dashboard/billing"
              label="Billing"
              icon={IconWallet}
              isActive={pathname.startsWith("/dashboard/billing")}
            />
            <NavLink
              href="/dashboard/api-keys"
              label="Developer"
              icon={IconKey}
              isActive={pathname.startsWith("/dashboard/api-keys")}
            />
          </Section>

          <Section title="Support">
            <NavLink
              href="/dashboard/feedback"
              label="Feedback"
              icon={IconMessageCircle}
              isActive={pathname.startsWith("/dashboard/feedback")}
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
            <Link
              href="/home"
              prefetch
              onClick={() => {
                if (pathname !== "/home") setLandingPending(true);
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-sidebar-text hover:bg-sidebar-active ${landingPending ? "opacity-60" : ""}`}
            >
              <IconHome className="h-4 w-4 shrink-0 text-sidebar-text" />
              View landing page
            </Link>
          </Section>
        </nav>
      </div>

      <div
        ref={userMenuRef}
        className="shrink-0 border-t border-sidebar-border bg-sidebar-bg p-4"
      >
        {isGuest ? (
          <Link
            href={signInUrl(pathname)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Sign in
          </Link>
        ) : sessionPending || !user ? (
          <div
            className="sidebar-user-block flex w-full items-center gap-3 rounded-lg px-3 py-2"
            aria-hidden
          >
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-sidebar-active" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 w-24 animate-pulse rounded bg-sidebar-active" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-sidebar-active/80" />
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="sidebar-user-block flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-active"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              aria-label={
                userMenuOpen ? "Close account menu" : "Open account menu"
              }
            >
              {user.image ? (
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
                <p className="truncate text-xs text-sidebar-text">
                  {planLabel}
                </p>
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
          </>
        )}
      </div>
    </aside>
  );
}

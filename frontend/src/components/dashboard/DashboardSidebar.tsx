/* eslint-disable react-hooks/set-state-in-effect */
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Image from "@/components/AppImage";
import Link from "@/components/AppLink";
import { useTheme } from "next-themes";
import {
  CalendarDots,
  ChartLine,
  ChatCircle,
  CheckCircle,
  Clock,
  List,
  NoteBlank,
  Pencil,
  PlugsConnected,
  SidebarSimple,
  SignIn,
  Sliders,
  SquaresFour,
  Stack,
  Users,
} from "@/icons/phosphor";
import { signInUrl } from "@/lib/sign-in-url";
import { SidebarAccountMenu } from "@/components/dashboard/SidebarAccountMenu";
import { SidebarHoverTip } from "@/components/dashboard/SidebarHoverTip";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";
import { WritingIcon } from "@/components/dashboard/WritingIcon";
import { switchWorkspace, listWorkspaces } from "@/api/team";
import {
  getDashboardRelativePath,
  getTeamIdFromPathname,
  isTeamAppPath,
  isTeamSettingsPath,
  useDashboardPath,
  writePersonalWorkspaceId,
} from "@/lib/dashboard-base-path";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { ExperimentalBadge } from "@/components/dashboard/ExperimentalBadge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

const SIDEBAR_COLLAPSED_KEY = "social0.sidebar.collapsed";

type IconWeight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{
    className?: string;
    size?: number;
    weight?: IconWeight;
  }>;
  experimental?: boolean;
};

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  collapsed,
  experimental,
}: NavItem & { isActive: boolean; collapsed: boolean }) {
  const pathname = useLocation().pathname;
  const [navPending, setNavPending] = useState(false);
  useEffect(() => {
    setNavPending(false);
  }, [pathname]);

  const link = (
    <Link
      href={href}
      prefetch
      onClick={() => {
        if (!isActive) setNavPending(true);
      }}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium text-sidebar-text transition-[background-color,opacity,transform] duration-150",
        "hover:bg-sidebar-active active:scale-[0.98]",
        isActive && "bg-sidebar-active",
        navPending && "opacity-60",
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2",
        experimental && collapsed && "relative",
      )}
    >
      <Icon
        className="h-4 w-4 shrink-0 text-sidebar-text"
        size={16}
        weight={isActive ? "fill" : "regular"}
      />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
      {experimental ? (
        <ExperimentalBadge compact={collapsed} className={collapsed ? "absolute -right-0.5 -top-0.5" : "ml-auto shrink-0"} />
      ) : null}
    </Link>
  );

  return (
    <SidebarHoverTip label={experimental ? `${label} (experimental)` : label} enabled={collapsed}>
      {link}
    </SidebarHoverTip>
  );
}

function Section({
  title,
  collapsed,
  children,
}: {
  title: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", collapsed && "space-y-0.5")}>
      {!collapsed ? (
        <p className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
          {title}
        </p>
      ) : (
        <div className="mx-auto my-1 h-px w-6 bg-sidebar-border" aria-hidden />
      )}
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

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
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
  const teamId = getTeamIdFromPathname(pathname);
  const onTeamSettings =
    !!teamId && pathname.includes(`/teams/${teamId}/settings`);
  const { data: workspacesData } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: !!user && !isGuest,
  });
  // Team settings only for collaborative teams (not personal extra workspaces).
  const activeWorkspace = workspacesData?.workspaces.find((w) => w.isActive);
  const settingsTeamId = activeWorkspace?.teamId ?? teamId;
  const showTeamSettings = Boolean(
    settingsTeamId &&
      workspacesData?.teams.find((t) => t.id === settingsTeamId)
        ?.isCollaborative,
  );
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [logoPending, setLogoPending] = useState(false);
  const [composerCtaPending, setComposerCtaPending] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCollapsed(readCollapsed());
  }, []);

  useEffect(() => {
    setLogoPending(false);
    setComposerCtaPending(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const logoSrc =
    mounted && resolvedTheme === "dark" ? "/logo-dark.png" : "/logo.png";

  return (
    <aside
      className={cn(
        "dashboard-sidebar relative z-10 hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg lg:flex",
        "transition-[width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        collapsed ? "w-[4.25rem]" : "w-56",
      )}
      data-sidebar="dashboard"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div
        className={cn(
          "flex shrink-0 flex-col gap-3",
          collapsed ? "items-center p-2 pt-3" : "gap-4 p-4",
        )}
      >
        <div
          className={cn(
            "flex w-full items-center",
            collapsed ? "flex-col gap-2" : "justify-between gap-2",
          )}
        >
          <SidebarHoverTip label="Social0" enabled={collapsed}>
            <Link
              href="/dashboard/composer"
              prefetch
              onClick={(e) => {
                const onTeam =
                  isTeamAppPath(pathname) || isTeamSettingsPath(pathname);
                if (!onTeam) {
                  if (pathname !== "/dashboard/composer") setLogoPending(true);
                  return;
                }
                e.preventDefault();
                if (logoPending) return;
                setLogoPending(true);
                void (async () => {
                  try {
                    await switchWorkspace(null);
                    writePersonalWorkspaceId(null);
                    window.location.assign("/dashboard/composer");
                  } catch (err) {
                    setLogoPending(false);
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Failed to open personal dashboard",
                    );
                  }
                })();
              }}
              className={cn(
                "flex items-center rounded-lg font-semibold text-sidebar-text",
                logoPending && "opacity-60",
                collapsed ? "justify-center p-1.5" : "gap-3 px-2 py-1.5",
              )}
              aria-label="Social0"
            >
              <Image
                src={logoSrc}
                alt="Social0"
                width={40}
                height={40}
                className={cn(
                  "shrink-0 rounded-full border border-white object-contain",
                  collapsed ? "h-9 w-9" : "h-10 w-10",
                )}
              />
              {!collapsed ? (
                <span className="font-logo text-[22px] font-normal tracking-tight text-foreground landing">
                  Social0
                </span>
              ) : null}
            </Link>
          </SidebarHoverTip>

          <SidebarHoverTip
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            enabled={collapsed}
          >
            <button
              type="button"
              onClick={toggleCollapsed}
              className={cn(
                "inline-flex items-center justify-center rounded-lg text-sidebar-muted transition-[background-color,color,transform] duration-150",
                "hover:bg-sidebar-active hover:text-sidebar-text active:scale-[0.97]",
                collapsed ? "h-9 w-9" : "h-9 w-9 shrink-0",
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
            >
              <SidebarSimple size={18} weight="regular" />
            </button>
          </SidebarHoverTip>
        </div>

        {!isGuest && !sessionPending ? (
          collapsed ? (
            <SidebarHoverTip label="Workspaces" enabled>
              <Link
                href="/dashboard/workspaces"
                prefetch
                aria-label="Workspaces"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-text transition-[background-color,transform] duration-150 hover:bg-sidebar-active active:scale-[0.98]"
              >
                <SquaresFour className="h-4 w-4" size={16} />
              </Link>
            </SidebarHoverTip>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
                Workspaces
              </p>
              <WorkspaceSwitcher enabled={!!user} />
            </div>
          )
        ) : null}

        <SidebarHoverTip label="Create post" enabled={collapsed}>
          <Link
            href={dash("composer")}
            prefetch
            onClick={() => {
              if (!relativeMatches(relative, "composer", { exact: true }))
                setComposerCtaPending(true);
            }}
            aria-label="Create post"
            className={cn(
              "sidebar-create-post-cta flex items-center justify-center rounded-xl bg-accent font-semibold text-accent-foreground shadow-sm transition-[background-color,opacity,transform] duration-150 hover:bg-accent-hover active:scale-[0.98]",
              composerCtaPending && "opacity-80",
              collapsed ? "h-9 w-9" : "w-full gap-2 px-4 py-2.5 text-sm",
            )}
          >
            <WritingIcon className="text-accent-foreground" size={16} />
            {!collapsed ? <span>Create post</span> : null}
          </Link>
        </SidebarHoverTip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible">
        <nav
          className={cn(
            "flex flex-col",
            collapsed ? "gap-3 px-2 pb-3" : "gap-6 p-4 pt-0",
          )}
        >
          <Section title="Create" collapsed={collapsed}>
            <NavLink
              href={dash("composer")}
              label="Composer"
              icon={Pencil}
              collapsed={collapsed}
              isActive={relativeMatches(relative, "composer", { exact: true })}
            />
            <NavLink
              href={dash("create")}
              label="Manual setup"
              icon={Sliders}
              collapsed={collapsed}
              isActive={relativeMatches(relative, "create")}
            />
            <NavLink
              href={dash("bulk-tools")}
              label="Bulk tools"
              icon={Stack}
              collapsed={collapsed}
              isActive={relativeMatches(relative, "bulk-tools")}
            />
          </Section>

          <Section title="Posts" collapsed={collapsed}>
            <NavLink
              href={dash("posts")}
              label="All"
              icon={List}
              collapsed={collapsed}
              isActive={relative === "posts"}
            />
            <NavLink
              href={dash("posts/posted")}
              label="Posted"
              icon={CheckCircle}
              collapsed={collapsed}
              isActive={relativeMatches(relative, "posts/posted")}
            />
            <NavLink
              href={dash("posts/scheduled")}
              label="Scheduled"
              icon={Clock}
              collapsed={collapsed}
              isActive={relativeMatches(relative, "posts/scheduled")}
            />
            <NavLink
              href={dash("posts/drafts")}
              label="Drafts"
              icon={NoteBlank}
              collapsed={collapsed}
              isActive={relativeMatches(relative, "posts/drafts")}
            />
            <NavLink
              href={dash("calendar")}
              label="Calendar"
              icon={CalendarDots}
              collapsed={collapsed}
              isActive={relativeMatches(relative, "calendar")}
            />
            <NavLink
              href={dash("analytics")}
              label="Analytics"
              icon={ChartLine}
              collapsed={collapsed}
              isActive={relativeMatches(relative, "analytics")}
              experimental
            />
            <NavLink
              href={dash("inbox")}
              label="Inbox"
              icon={ChatCircle}
              collapsed={collapsed}
              isActive={relativeMatches(relative, "inbox")}
              experimental
            />
          </Section>

          <Section title="Workspace" collapsed={collapsed}>
            <NavLink
              href={dash("connections")}
              label="Connections"
              icon={PlugsConnected}
              collapsed={collapsed}
              isActive={relative === "connections"}
            />
            {showTeamSettings && settingsTeamId ? (
              <NavLink
                href={`/dashboard/teams/${settingsTeamId}/settings`}
                label="Team settings"
                icon={Users}
                collapsed={collapsed}
                isActive={onTeamSettings}
              />
            ) : (
              <NavLink
                href="/dashboard/teams"
                label="Teams"
                icon={Users}
                collapsed={collapsed}
                isActive={
                  pathname === "/dashboard/teams" ||
                  pathname.startsWith("/dashboard/teams/create")
                }
              />
            )}
          </Section>
        </nav>
      </div>

      <div
        className={cn(
          "relative z-20 shrink-0 border-t border-sidebar-border bg-sidebar-bg",
          collapsed ? "p-2" : "p-4",
        )}
      >
        {isGuest ? (
          <SidebarHoverTip label="Sign in" enabled={collapsed}>
            <Link
              href={signInUrl(pathname)}
              aria-label="Sign in"
              className={cn(
                "flex items-center justify-center rounded-lg bg-accent font-semibold text-accent-foreground transition-colors hover:bg-accent-hover",
                collapsed ? "h-9 w-9" : "w-full gap-2 px-3 py-2.5 text-sm",
              )}
            >
              {collapsed ? <SignIn size={16} /> : "Sign in"}
            </Link>
          </SidebarHoverTip>
        ) : sessionPending || !user ? (
          <div
            className={cn(
              "sidebar-user-block flex items-center",
              collapsed
                ? "justify-center p-1"
                : "w-full gap-3 rounded-lg px-3 py-2",
            )}
            aria-hidden
          >
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-sidebar-active" />
            {!collapsed ? (
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-sidebar-active" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-sidebar-active/80" />
              </div>
            ) : null}
          </div>
        ) : (
          <SidebarAccountMenu
            user={user}
            planLabel={planLabel}
            railCollapsed={collapsed}
          />
        )}
      </div>
    </aside>
  );
}

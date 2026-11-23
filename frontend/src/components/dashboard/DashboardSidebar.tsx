import { useLocation } from "react-router-dom";
import { useState, type ComponentType } from "react";
import Image from "@/components/AppImage";
import Link from "@/components/AppLink";
import { useTheme } from "next-themes";
import {
  CalendarDots,
  ChartLine,
  Files,
  GearSix,
  House,
  Lightning,
  NotePencil,
  Plus,
  Robot,
  SidebarSimple,
  SignIn,
  PlugsConnected,
  Tray,
} from "@/icons/phosphor";
import { signInUrl } from "@/lib/sign-in-url";
import { SidebarAccountMenu } from "@/components/dashboard/SidebarAccountMenu";
import { SidebarHoverTip } from "@/components/dashboard/SidebarHoverTip";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";
import { SetupPill } from "@/features/dashboard/home/SetupPill";
import { AccountAvatar } from "@/components/AccountAvatar";
import { AccountPlatformMark } from "@/components/PlatformIcon";
import {
  getDashboardRelativePath,
  useDashboardPath,
} from "@/lib/dashboard-base-path";
import { planName as toPlanName } from "@/lib/plan-name";
import { getPlanLimits, type SubscriptionTier } from "@/lib/plans";
import {
  networkLabel,
  isComposerPagePath,
  openComposer,
  shortcutLabel,
  formatBadgeCount,
  useAccountHealth,
  useInboxNeedsReplyCount,
  type AccountWithHealth,
} from "@/components/app";
import { cn } from "@/lib/utils";
import { ExperimentalBadge } from "@/components/dashboard/ExperimentalBadge";

const SIDEBAR_COLLAPSED_KEY = "social0.sidebar.collapsed";
const MAX_ACCOUNT_ROWS = 5;

type IconWeight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
type NavIcon = ComponentType<{ className?: string; size?: number; weight?: IconWeight }>;

function relativeMatches(relative: string, target: string) {
  return relative === target || relative.startsWith(`${target}/`);
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  collapsed,
  shortcut,
  trailing,
  accessibleLabel,
  experimental,
}: {
  href: string;
  label: string;
  icon: NavIcon;
  isActive: boolean;
  collapsed: boolean;
  /** Shortcut hint for the collapsed-rail tooltip only. */
  shortcut?: string;
  trailing?: React.ReactNode;
  /** Full name for screen readers when `trailing` carries meaning (counts). */
  accessibleLabel?: string;
  /** Early-access feature: flask after the label, "(experimental)" in the rail tip. */
  experimental?: boolean;
}) {
  const tipLabel = experimental ? `${label} (experimental)` : label;
  return (
    <SidebarHoverTip
      label={shortcut ? `${tipLabel} · ${shortcutLabel(shortcut)}` : tipLabel}
      enabled={collapsed}
    >
      <Link
        href={href}
        prefetch
        aria-label={accessibleLabel ?? (collapsed ? label : undefined)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "relative flex items-center rounded-lg text-sm font-medium text-sidebar-text transition-[background-color,transform] duration-150",
          "hover:bg-sidebar-active active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          isActive && "bg-sidebar-active",
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-[7px]",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" size={16} weight={isActive ? "fill" : "regular"} />
        {!collapsed ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate">{label}</span>
            {experimental ? <ExperimentalBadge compact /> : null}
          </span>
        ) : null}
        {trailing}
      </Link>
    </SidebarHoverTip>
  );
}

function GroupLabel({ title, collapsed }: { title: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="mx-auto my-1.5 h-px w-6 bg-sidebar-border" aria-hidden />;
  }
  return (
    <p className="px-3 pb-1 pt-5 text-xs font-medium text-sidebar-muted">
      {title}
    </p>
  );
}

/** Healthy accounts get nothing; only a problem earns a dot. */
function needsAttention(account: AccountWithHealth) {
  return account.health !== "healthy";
}

function ProblemDot({ account }: { account: AccountWithHealth }) {
  if (!needsAttention(account)) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        account.health === "expired" ? "bg-warning-solid" : "bg-text-subtle",
      )}
    />
  );
}

function AccountRow({
  account,
  href,
  canManage,
}: {
  account: AccountWithHealth;
  href: string;
  canManage: boolean;
}) {
  const expired = account.health === "expired";
  const label = `${networkLabel(account.platform)} ${account.handle}`;
  const body = (
    <>
      <span className="relative h-5 w-5 shrink-0">
        <AccountAvatar
          profileImageUrl={account.profileImageUrl}
          username={account.platformUsername}
          platform={account.platform}
          fill
          className="h-5 w-5"
        />
        <AccountPlatformMark platform={account.platform} compact className="-bottom-1 -right-1 h-3 w-3 border" />
      </span>
      <span className="min-w-0 flex-1 truncate">{account.handle}</span>
      {expired && canManage ? (
        // The dot says "problem"; the fix shows when you reach for it.
        <span className="sr-only shrink-0 text-xs font-medium text-warning group-hover/acct:not-sr-only group-focus-visible/acct:not-sr-only touch:not-sr-only">
          Reconnect
        </span>
      ) : null}
      <ProblemDot account={account} />
    </>
  );
  const cls =
    "group/acct flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-sidebar-text transition-colors hover:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  // Broken accounts go straight to OAuth re-auth (full navigation).
  if (expired && canManage) {
    return (
      <a href={account.reconnectHref} className={cls} title={`${label}: sign-in expired. Reconnect`}>
        {body}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={cls}
      title={
        expired
          ? `${label}: sign-in expired`
          : account.health === "inactive"
            ? `${label}: paused`
            : label
      }
    >
      {body}
    </Link>
  );
}

function AccountsSection({
  collapsed,
  isActive,
}: {
  collapsed: boolean;
  isActive: boolean;
}) {
  const dash = useDashboardPath();
  const { accounts, broken, canManageConnections, isLoading } = useAccountHealth();
  // Problems first (sign-in expired, then paused) so they're never hidden
  // behind the "All accounts" link.
  const rank = (a: AccountWithHealth) =>
    a.health === "expired" ? 0 : a.health === "inactive" ? 1 : 2;
  const sorted = [...accounts].sort((a, b) => rank(a) - rank(b));
  const shown = sorted.slice(0, MAX_ACCOUNT_ROWS);
  const extra = sorted.length - shown.length;

  if (collapsed) {
    return (
      <NavLink
        href={dash("connections")}
        label={
          broken.length
            ? `Accounts (${broken.length} ${broken.length === 1 ? "needs" : "need"} reconnecting)`
            : "Accounts"
        }
        icon={PlugsConnected}
        collapsed
        isActive={isActive}
        trailing={
          broken.length ? (
            <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning-solid" />
          ) : null
        }
      />
    );
  }

  return (
    <div className="space-y-px">
      {isLoading
        ? [0, 1].map((i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-1.5" aria-hidden>
              <span className="h-5 w-5 animate-pulse rounded-full bg-sidebar-active" />
              <span className="h-2.5 w-24 animate-pulse rounded bg-sidebar-active" />
            </div>
          ))
        : shown.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              href={dash(`connections?account=${encodeURIComponent(a.id)}`)}
              canManage={canManageConnections}
            />
          ))}
      {extra > 0 ? (
        <Link
          href={dash("connections")}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "block rounded-lg px-3 py-1.5 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-sidebar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            isActive && "bg-sidebar-active text-sidebar-text",
          )}
        >
          All accounts ({accounts.length})
        </Link>
      ) : null}
      {canManageConnections ? (
        <Link
          href={dash("connections?connect=1")}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-sidebar-text",
            isActive && accounts.length === 0 && "bg-sidebar-active",
          )}
        >
          <Plus className="h-4 w-4 shrink-0" size={16} />
          Connect account
        </Link>
      ) : null}
    </div>
  );
}

const meterLinkCls =
  "block rounded-lg px-3 py-1.5 transition-colors hover:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/** Plan meter: from 70% of the account limit, or always on Free (posts used). */
function PlanMeter({
  tier,
  freePosts,
}: {
  tier: string | null;
  freePosts: { remaining: number; limit: number } | null;
}) {
  const { accounts, accountLimit, canAccessBilling } = useAccountHealth();
  // `tier` is the signed-in user's own plan, while the account counts follow
  // the active workspace. Only show the meter where both describe the same
  // plan: personal scope or a workspace the user owns (billing access).
  if (!tier || !canAccessBilling) return null;
  const name = toPlanName(tier);
  const used = accountLimit?.currentTotal ?? accounts.filter((a) => a.isActive !== false).length;
  const limit =
    accountLimit?.limitTotal ?? getPlanLimits(tier as SubscriptionTier).maxConnectedAccounts;
  const atAccountLimit = limit > 0 && used >= limit;

  // No progress bar: it read like a goal to fill. Say something only when a
  // limit actually gets in the way (or is about to, on Free).
  let message: string | null = null;
  if (freePosts && freePosts.remaining <= 3) {
    message =
      freePosts.remaining <= 0
        ? "No free posts left"
        : `${freePosts.remaining} free post${freePosts.remaining === 1 ? "" : "s"} left`;
  } else if (atAccountLimit) {
    message = "Account limit reached";
  }
  if (!message) return null;
  return (
    <Link href="/dashboard/billing" className={meterLinkCls} title={`${name} plan`}>
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-sidebar-muted">{message}</span>
        <span className="font-medium text-accent">Upgrade</span>
      </span>
    </Link>
  );
}

export type DashboardSidebarProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  /** Subscription tier id ("free" | "starter" | …); null while loading. */
  planTier: string | null;
  /** Free plan lifetime posts; null on paid plans. */
  freePosts?: { remaining: number; limit: number } | null;
  isGuest?: boolean;
  sessionPending?: boolean;
  /** True until dashboard-layout RPC resolves role gates. */
  layoutPending?: boolean;
  canCreatePosts?: boolean;
  canViewAnalytics?: boolean;
  canViewInbox?: boolean;
};

/**
 * Jobs-first sidebar (mock 01·A, without a visible search box: ⌘K only).
 * Header: logo, workspace switcher with plan badge, compose icon.
 * Nav: Home · Inbox · Calendar · Posts · Grow (Analytics, Automations) ·
 * Accounts (max 5, problems first, amber dot only when something is
 * wrong). Footer: AI agents, Settings, thin plan meter, user.
 */
export function DashboardSidebar({
  user,
  planTier,
  freePosts = null,
  isGuest = false,
  sessionPending = false,
  layoutPending = false,
  canCreatePosts = true,
  canViewAnalytics = true,
  canViewInbox = true,
}: DashboardSidebarProps) {
  const pathname = useLocation().pathname;
  const dash = useDashboardPath();
  const relative = getDashboardRelativePath(pathname);
  const { resolvedTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(readCollapsed);

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

  const logoSrc = resolvedTheme === "dark" ? "/logo-dark.png" : "/logo.png";
  // Hidden on the full-page composer: the modal would open a second editor
  // on the same autosaved draft (openComposer() ignores it there anyway).
  const showCreate = (layoutPending || canCreatePosts) && !isComposerPagePath(relative);
  const showAnalytics = layoutPending || canViewAnalytics;
  const showInbox = layoutPending || canViewInbox;
  const needsReply = useInboxNeedsReplyCount();
  const inboxBadge = canViewInbox && needsReply ? needsReply : null;
  const signedIn = !isGuest && !sessionPending && !!user;
  const planName = planTier ? toPlanName(planTier) : null;

  const isPosts = relativeMatches(relative, "posts") || relativeMatches(relative, "bulk-tools");
  const isAccounts = relativeMatches(relative, "connections") || relativeMatches(relative, "connect");
  const isSettings = relativeMatches(relative, "settings");

  return (
    <aside
      className={cn(
        "dashboard-sidebar relative z-10 hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg lg:flex",
        "transition-[width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
        collapsed ? "w-[4.25rem]" : "w-60",
      )}
      data-sidebar="dashboard"
      data-collapsed={collapsed ? "true" : "false"}
      aria-label="Dashboard"
    >
      {/* Header: logo · workspace switcher · compose · collapse */}
      <div className={cn("flex shrink-0 gap-1", collapsed ? "flex-col items-center p-2 pt-3" : "items-center p-3")}>
        <SidebarHoverTip label="Home" enabled={collapsed}>
          <Link
            href={dash("home")}
            prefetch
            aria-label="Social0 home"
            className="flex shrink-0 items-center justify-center rounded-lg p-1"
          >
            <Image
              src={logoSrc}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-full object-contain"
            />
          </Link>
        </SidebarHoverTip>
        {signedIn && !collapsed ? (
          <WorkspaceSwitcher enabled planName={planName} className="flex-1" />
        ) : (
          <span className="flex-1" />
        )}
        {showCreate && !isGuest ? (
          <SidebarHoverTip label={`New post · ${shortcutLabel("c")}`} enabled={collapsed}>
            <button
              type="button"
              onClick={() => openComposer()}
              aria-label="New post"
              title={collapsed ? undefined : `New post (${shortcutLabel("c")})`}
              className="sidebar-compose inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1"
            >
              <NotePencil size={16} weight="bold" />
            </button>
          </SidebarHoverTip>
        ) : null}
      </div>

      <nav
        aria-label="Main"
        className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-visible", collapsed ? "px-2 pb-3" : "px-3 pb-3")}
      >
        <div className="space-y-px">
          <NavLink href={dash("home")} label="Home" icon={House} collapsed={collapsed} shortcut="g h" isActive={relativeMatches(relative, "home")} />
          {showInbox ? (
            <NavLink
              href={dash("inbox")}
              label="Inbox"
              icon={Tray}
              experimental
              collapsed={collapsed}
              shortcut="g i"
              isActive={relativeMatches(relative, "inbox")}
              accessibleLabel={
                inboxBadge
                  ? `Inbox, ${inboxBadge} ${inboxBadge === 1 ? "needs" : "need"} a reply`
                  : undefined
              }
              trailing={
                inboxBadge ? (
                  collapsed ? (
                    <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                  ) : (
                    <span
                      aria-hidden
                      className="ml-auto min-w-5 rounded-full bg-accent/15 px-1.5 py-px text-center text-[11px] font-semibold tabular-nums text-accent"
                    >
                      {formatBadgeCount(inboxBadge)}
                    </span>
                  )
                ) : null
              }
            />
          ) : null}
          <NavLink href={dash("calendar")} label="Calendar" icon={CalendarDots} collapsed={collapsed} shortcut="g c" isActive={relativeMatches(relative, "calendar")} />
          <NavLink href={dash("posts")} label="Posts" icon={Files} collapsed={collapsed} shortcut="g p" isActive={isPosts} />
        </div>

        <GroupLabel title="Grow" collapsed={collapsed} />
        <div className="space-y-px">
          {showAnalytics ? (
            <NavLink href={dash("analytics")} label="Analytics" icon={ChartLine} experimental collapsed={collapsed} shortcut="g a" isActive={relativeMatches(relative, "analytics")} />
          ) : null}
          <NavLink
            href={dash("automations")}
            label="Automations"
            icon={Lightning}
            collapsed={collapsed}
            isActive={relativeMatches(relative, "automations")}
          />
        </div>

        {signedIn ? (
          <>
            <GroupLabel title="Accounts" collapsed={collapsed} />
            <AccountsSection collapsed={collapsed} isActive={isAccounts} />
          </>
        ) : null}
      </nav>

      <div className={cn("relative z-20 shrink-0 border-t border-sidebar-border bg-sidebar-bg", collapsed ? "space-y-1 p-2" : "space-y-px p-3")}>
        {signedIn ? (
          <>
            <NavLink href={dash("agents")} label="AI agents" icon={Robot} collapsed={collapsed} isActive={relativeMatches(relative, "agents") || relativeMatches(relative, "api-keys")} />
            <NavLink href={dash("settings")} label="Settings" icon={GearSix} collapsed={collapsed} isActive={isSettings} />
            <SetupPill collapsed={collapsed} className={collapsed ? undefined : "mb-1"} />
            {!collapsed ? <PlanMeter tier={planTier} freePosts={freePosts} /> : null}
          </>
        ) : null}

        <div className={cn("flex items-center gap-1 pt-1", collapsed && "flex-col")}>
          <div className="min-w-0 flex-1">
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
              <div className={cn("sidebar-user-block flex items-center", collapsed ? "justify-center p-1" : "gap-3 px-3 py-2")} aria-hidden>
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-sidebar-active" />
                {!collapsed ? <div className="h-3 w-24 animate-pulse rounded bg-sidebar-active" /> : null}
              </div>
            ) : (
              <SidebarAccountMenu
                user={user}
                planLabel={planTier ? `${toPlanName(planTier)} plan` : "..."}
                planPending={layoutPending}
                railCollapsed={collapsed}
              />
            )}
          </div>
          <SidebarHoverTip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} enabled={collapsed}>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-sidebar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
            >
              <SidebarSimple size={18} />
            </button>
          </SidebarHoverTip>
        </div>
      </div>
    </aside>
  );
}

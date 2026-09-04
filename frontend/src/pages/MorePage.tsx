import Link from "@/components/AppLink";
import Image from "@/components/AppImage";
import {
  BookOpen,
  CalendarDots,
  ChartLine,
  ChatCircle,
  CheckCircle,
  Clock,
  Code,
  CreditCard,
  GearSix,
  House,
  Megaphone,
  NoteBlank,
  List,
  Sliders,
  SquaresFour,
  Stack,
  Users,
  XLogo,
} from "@/icons/phosphor";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { loadDashboardLayoutData } from "@/api/dashboard-data";
import { listWorkspaces } from "@/api/team";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { WorkspaceIcon } from "@/lib/workspace-icons";
import { ExperimentalBadge } from "@/components/dashboard/ExperimentalBadge";
import { SkeletonBone } from "@/components/ui/skeleton-bone";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DOCS_DASHBOARD_URL } from "@/lib/docs-url";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

function getPlanLabel(tier: string): string {
  if (tier === "pro") return "Pro plan";
  if (tier === "growth") return "Growth plan";
  if (tier === "starter") return "Starter (Lite) plan";
  return "Free plan";
}

type MoreLink = {
  href: string;
  label: string;
  icon: typeof ChartLine;
  experimental?: boolean;
  external?: boolean;
};

/** Workspace first: it scopes everything else on the page. */
const WORKSPACE_LINKS: MoreLink[] = [
  { href: "/dashboard/workspaces", label: "Workspaces", icon: SquaresFour },
  { href: "/dashboard/teams", label: "Teams", icon: Users },
];

const MANUAL_POSTING_LINKS: MoreLink[] = [
  { href: "/dashboard/create", label: "Manual setup", icon: Sliders },
  { href: "/dashboard/bulk-tools", label: "Bulk tools", icon: Stack },
];

const POSTS_LINKS: MoreLink[] = [
  { href: "/dashboard/posts", label: "All posts", icon: List },
  { href: "/dashboard/posts/scheduled", label: "Scheduled", icon: Clock },
  { href: "/dashboard/posts/posted", label: "Posted", icon: CheckCircle },
  { href: "/dashboard/posts/drafts", label: "Drafts", icon: NoteBlank },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDots },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    icon: ChartLine,
    experimental: true,
  },
  {
    href: "/dashboard/inbox",
    label: "Inbox",
    icon: ChatCircle,
    experimental: true,
  },
];

const ACCOUNT_LINKS: MoreLink[] = [
  { href: "/dashboard/settings", label: "Account settings", icon: GearSix },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/api-keys", label: "Developer", icon: Code },
];

/** Previously buried one tap deeper inside the profile dropdown. */
const RESOURCE_LINKS: MoreLink[] = [
  { href: DOCS_DASHBOARD_URL, label: "Docs", icon: BookOpen, external: true },
  {
    href: "/dashboard/feedback",
    label: "Feedback & Feature Request",
    icon: Megaphone,
  },
  {
    href: `mailto:${LEGAL_ENTITY.supportEmail}`,
    label: "Get support",
    icon: ChatCircle,
    external: true,
  },
  {
    href: "https://x.com/social0_app",
    label: "Follow us",
    icon: XLogo,
    external: true,
  },
  { href: "/home", label: "View landing page", icon: House },
];

const ROW_CLASS =
  "flex min-h-[44px] items-center gap-3 px-4 py-3 text-sm font-medium text-text transition-colors touch-manipulation hover:bg-bg-subtle active:bg-bg-muted";

function MoreRow({ link }: { link: MoreLink }) {
  const { href, label, icon: Icon, experimental, external } = link;
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-text-muted" />
      <span className="flex-1">{label}</span>
      {experimental ? <ExperimentalBadge compact /> : null}
    </>
  );
  if (external) {
    return (
      <li>
        <a
          href={href}
          target={href.startsWith("mailto:") ? undefined : "_blank"}
          rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
          className={ROW_CLASS}
        >
          {body}
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link href={href} className={ROW_CLASS}>
        {body}
      </Link>
    </li>
  );
}

function MoreSection({
  title,
  links,
  loading,
  className,
}: {
  title: string;
  links: MoreLink[];
  loading?: boolean;
  className?: string;
}) {
  return (
    <section className={className ?? "mt-6"}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h2>
      <ul className="overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">
        {loading
          ? links.map((link) => (
              <li
                key={link.href}
                className="flex min-h-[44px] items-center gap-3 px-4 py-3"
              >
                <SkeletonBone className="h-4 w-4 rounded" />
                <SkeletonBone className="h-3 w-28" />
              </li>
            ))
          : links.map((link) => <MoreRow key={link.href} link={link} />)}
      </ul>
    </section>
  );
}

export function MorePage() {
  const { data: session } = useSession();
  const { data: layoutData } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    enabled: !!session,
  });
  // The desktop sidebar has a workspace switcher; mobile had no way to even
  // see which workspace was active. Surface it here.
  const { data: workspaces } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: !!session,
  });

  const planLabel = getPlanLabel(layoutData?.subscriptionTier ?? "free");
  const user = session?.user;
  const layoutReady = Boolean(layoutData);
  const canCreatePosts = layoutReady
    ? (layoutData?.canCreatePosts ?? false)
    : false;
  const canViewAnalytics = layoutReady
    ? (layoutData?.canViewAnalytics ?? false)
    : false;
  const canViewInbox = layoutReady ? (layoutData?.canViewInbox ?? false) : false;

  const activeWorkspace = workspaces?.workspaces.find((w) => w.isActive);
  const otherWorkspaceCount = workspaces
    ? Math.max(0, workspaces.workspaces.length - 1)
    : 0;

  const postsLinks = POSTS_LINKS.filter((link) => {
    if (!layoutReady) return true;
    if (link.href === "/dashboard/analytics") return canViewAnalytics;
    if (link.href === "/dashboard/inbox") return canViewInbox;
    return true;
  });

  return (
    <div className="pb-2">
      <h1 className="dash-page-title">More</h1>
      <p className="dash-page-subtitle">
        Settings and the rest of the dashboard.
      </p>

      {/* Identity only. This used to be a collapsible that re-listed Account
          settings, Billing, Developer and the resource links — all of which
          are now flat sections below, one tap instead of two. */}
      {user ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-bg-elevated p-3 shadow-sm">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-muted text-sm font-semibold text-text-muted">
              {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">
              {user.name ?? user.email}
            </p>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
          </div>
          <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
            {layoutReady ? planLabel : "…"}
          </span>
        </div>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Workspace
        </h2>
        <ul className="overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">
          {activeWorkspace ? (
            <li className="flex items-center gap-3 border-b border-border px-4 py-3">
              <WorkspaceIcon
                id={activeWorkspace.icon ?? "house"}
                className="h-4 w-4 shrink-0 text-text-muted"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium capitalize text-text">
                  {activeWorkspace.name}
                </span>
                <span className="block text-xs text-accent">Active</span>
              </span>
              {otherWorkspaceCount > 0 ? (
                <Link
                  href="/dashboard/workspaces"
                  className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-border px-3 text-xs font-medium text-text transition-colors touch-manipulation hover:bg-bg-subtle touch:min-h-11 touch:px-4"
                >
                  Switch
                </Link>
              ) : null}
            </li>
          ) : null}
          {WORKSPACE_LINKS.map((link) => (
            <MoreRow key={link.href} link={link} />
          ))}
        </ul>
      </section>

      {!layoutReady || canCreatePosts ? (
        <MoreSection
          title="Manual posting"
          links={MANUAL_POSTING_LINKS}
          loading={!layoutReady}
        />
      ) : null}

      <MoreSection title="Posts & tools" links={postsLinks} />

      <MoreSection title="Account" links={ACCOUNT_LINKS} />

      <MoreSection title="Resources" links={RESOURCE_LINKS} />

      <section className="mt-6 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Appearance
        </h2>
        <ThemeToggle />
        <SignOutButton />
      </section>
    </div>
  );
}

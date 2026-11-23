import Link from "@/components/AppLink";
import Image from "@/components/AppImage";
import {
  BookOpen,
  ChartLine,
  ChatCircle,
  Code,
  CreditCard,
  Files,
  GearSix,
  House,
  Lightning,
  Megaphone,
  PlugsConnected,
  Robot,
  SquaresFour,
  Stack,
  Users,
  XLogo,
} from "@/icons/phosphor";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { loadDashboardLayoutData } from "@/api/dashboard-data";
import { SkeletonBone } from "@/components/ui/skeleton-bone";
import { PageContainer, PageHeader } from "@/components/app";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DOCS_DASHBOARD_URL } from "@/lib/docs-url";
import { LEGAL_ENTITY } from "@/lib/legal-entity";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { planLabel as toPlanLabel } from "@/lib/plan-name";

type MoreLink = {
  href: string;
  label: string;
  icon: typeof ChartLine;
  external?: boolean;
};

/** Previously buried one tap deeper inside the profile dropdown. */
const RESOURCE_LINKS: MoreLink[] = [
  { href: DOCS_DASHBOARD_URL, label: "Docs", icon: BookOpen, external: true },
  {
    href: "/dashboard/feedback",
    label: "Feedback & feature requests",
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
  const { href, label, icon: Icon, external } = link;
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-text-muted" />
      <span className="flex-1">{label}</span>
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
      <h2 className="mb-2 text-xs font-medium text-text-muted">
        {title}
      </h2>
      <ul className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
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
  const dash = useDashboardPath();
  const { data: layoutData } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    enabled: !!session,
  });

  const tier = layoutData?.subscriptionTier ?? "free";
  const user = session?.user;
  const layoutReady = Boolean(layoutData);
  // While loading, show everything (skeleton rows); deny on known role.
  const canCreatePosts = !layoutReady || (layoutData?.canCreatePosts ?? false);
  const canViewAnalytics = !layoutReady || (layoutData?.canViewAnalytics ?? false);

  const workLinks: MoreLink[] = [
    { href: dash("posts"), label: "Posts", icon: Files },
    ...(canViewAnalytics
      ? [{ href: dash("analytics"), label: "Analytics", icon: ChartLine }]
      : []),
    { href: dash("automations"), label: "Automations", icon: Lightning },
    ...(canCreatePosts
      ? [{ href: dash("bulk-tools"), label: "Bulk import", icon: Stack }]
      : []),
  ];

  const workspaceLinks: MoreLink[] = [
    { href: dash("connections"), label: "Accounts", icon: PlugsConnected },
    { href: dash("agents"), label: "AI agents", icon: Robot },
    { href: dash("settings/general"), label: "Workspace settings", icon: GearSix },
    { href: "/dashboard/settings/workspaces", label: "Workspaces", icon: SquaresFour },
    { href: "/dashboard/settings/members", label: "Teams", icon: Users },
  ];

  const accountLinks: MoreLink[] = [
    { href: "/dashboard/settings/profile", label: "Account settings", icon: GearSix },
    { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
    { href: dash("agents?tab=keys"), label: "API keys", icon: Code },
  ];

  return (
    <PageContainer className="pb-2">
      <PageHeader title="More" />

      {user ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated p-3">
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
            {layoutReady ? toPlanLabel(tier) : "…"}
          </span>
        </div>
      ) : null}

      {/* Workspace switching lives in the mobile top bar (one switcher). */}
      <MoreSection title="Work" links={workLinks} loading={!layoutReady} />
      <MoreSection title="Workspace settings" links={workspaceLinks} />
      <MoreSection title="Account" links={accountLinks} />
      <MoreSection title="Resources" links={RESOURCE_LINKS} />

      <section className="mt-6 space-y-3">
        <h2 className="text-xs font-medium text-text-muted">
          Appearance
        </h2>
        <ThemeToggle />
        <SignOutButton />
      </section>
    </PageContainer>
  );
}

import Link from "@/components/AppLink";
import {
  CalendarDots,
  ChartLine,
  ChatCircle,
  CheckCircle,
  Clock,
  Code,
  CreditCard,
  GearSix,
  NoteBlank,
  List,
  Sliders,
  SquaresFour,
  Stack,
  Users,
} from "@/icons/phosphor";
import { MorePageAccountCollapsible } from "@/components/dashboard/MorePageAccountCollapsible";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { loadDashboardLayoutData } from "@/api/dashboard-data";
import { ExperimentalBadge } from "@/components/dashboard/ExperimentalBadge";

function getPlanLabel(tier: string): string {
  if (tier === "pro") return "Pro plan";
  if (tier === "growth") return "Growth plan";
  if (tier === "starter") return "Starter (Lite) plan";
  return "Free plan";
}

const MANUAL_POSTING_LINKS = [
  { href: "/dashboard/create", label: "Manual setup", icon: Sliders },
  { href: "/dashboard/bulk-tools", label: "Bulk tools", icon: Stack },
] as const;

const MORE_LINKS: Array<{
  href: string;
  label: string;
  icon: (typeof ChartLine);
  experimental?: boolean;
}> = [
  { href: "/dashboard/posts", label: "All posts", icon: List },
  { href: "/dashboard/posts/scheduled", label: "Scheduled", icon: Clock },
  { href: "/dashboard/posts/posted", label: "Posted", icon: CheckCircle },
  { href: "/dashboard/posts/drafts", label: "Drafts", icon: NoteBlank },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDots },
  { href: "/dashboard/analytics", label: "Analytics", icon: ChartLine, experimental: true },
  { href: "/dashboard/inbox", label: "Inbox", icon: ChatCircle, experimental: true },
  { href: "/dashboard/workspaces", label: "Workspaces", icon: SquaresFour },
  { href: "/dashboard/teams", label: "Teams", icon: Users },
  { href: "/dashboard/settings", label: "Account settings", icon: GearSix },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/api-keys", label: "Developer", icon: Code },
];

export function MorePage() {
  const { data: session } = useSession();
  const { data: layoutData } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    enabled: !!session,
  });

  const planLabel = getPlanLabel(layoutData?.subscriptionTier ?? "free");
  const user = session?.user;
  const layoutReady = Boolean(layoutData);
  const canCreatePosts = layoutReady ? (layoutData?.canCreatePosts ?? false) : false;
  const canViewAnalytics = layoutReady
    ? (layoutData?.canViewAnalytics ?? false)
    : false;
  const canViewInbox = layoutReady ? (layoutData?.canViewInbox ?? false) : false;

  const moreLinks = MORE_LINKS.filter((link) => {
    if (link.href === "/dashboard/analytics") return canViewAnalytics;
    if (link.href === "/dashboard/inbox") return canViewInbox;
    return true;
  });

  return (
    <div>
      <h1 className="mb-2 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
        More
      </h1>
      <p className="mt-1.5 text-sm text-text-muted sm:mt-2">
        Settings and the rest of the dashboard.
      </p>

      {user && (
        <MorePageAccountCollapsible
          image={user.image}
          name={user.name}
          email={user.email}
          planLabel={planLabel}
        />
      )}

      {canCreatePosts ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
            Manual posting
          </h2>
          <ul className="space-y-0.5 rounded-xl border border-border bg-bg-elevated shadow-sm sm:space-y-1">
            {MANUAL_POSTING_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex min-h-[44px] items-center gap-3 px-4 py-3 text-sm font-medium text-text hover:bg-bg-subtle transition-colors active:bg-bg-muted touch-manipulation"
                >
                  <Icon className="h-4 w-4 shrink-0 text-text-muted" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
          Posts & tools
        </h2>
        <ul className="space-y-0.5 rounded-xl border border-border bg-bg-elevated shadow-sm sm:space-y-1">
          {moreLinks.map(({ href, label, icon: Icon, experimental }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-[44px] items-center gap-3 px-4 py-3 text-sm font-medium text-text hover:bg-bg-subtle transition-colors active:bg-bg-muted touch-manipulation"
              >
                <Icon className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="flex-1">{label}</span>
                {experimental ? <ExperimentalBadge compact /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

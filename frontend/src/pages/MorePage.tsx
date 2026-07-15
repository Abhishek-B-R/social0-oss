import Link from "@/components/AppLink";
import {
  IconSettings,
  IconStack2,
  IconList,
  IconClock,
  IconCircleCheck,
  IconFileText,
  IconCreditCard,
  IconMessageCircle,
  IconTool,
  IconUsers,
} from "@tabler/icons-react";
import { DOCS_MORE_URL } from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";
import { MorePageAccountCollapsible } from "@/components/dashboard/MorePageAccountCollapsible";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";

function getPlanLabel(tier: string): string {
  if (tier === "pro") return "Pro plan";
  if (tier === "growth") return "Growth plan";
  if (tier === "starter") return "Starter (Lite) plan";
  return "Free plan";
}

const MANUAL_POSTING_LINKS = [
  { href: "/dashboard/create", label: "Manual setup", icon: IconTool },
  { href: "/dashboard/bulk-tools", label: "Bulk tools", icon: IconStack2 },
] as const;

const MORE_LINKS = [
  { href: "/dashboard/posts", label: "All posts", icon: IconList },
  { href: "/dashboard/posts/scheduled", label: "Scheduled", icon: IconClock },
  { href: "/dashboard/posts/posted", label: "Posted", icon: IconCircleCheck },
  { href: "/dashboard/posts/drafts", label: "Drafts", icon: IconFileText },
  { href: "/dashboard/teams", label: "Teams", icon: IconUsers },
  { href: "/dashboard/settings", label: "Settings", icon: IconSettings },
  { href: "/dashboard/api-keys", label: "Developer", icon: IconSettings },
  { href: "/dashboard/billing", label: "Billing", icon: IconCreditCard },
] as const;

export function MorePage() {
  const { data: session } = useSession();
  const { data: layoutData } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: () =>
      rpc<{ subscriptionTier: string }>("dashboard-data.loadDashboardLayoutData"),
    enabled: !!session,
  });

  const planLabel = getPlanLabel(layoutData?.subscriptionTier ?? "free");
  const user = session?.user;

  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2 sm:text-3xl">
          More
        </h1>
        <DocsInfoIcon url={DOCS_MORE_URL} />
      </div>
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

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
          Posts & tools
        </h2>
        <ul className="space-y-0.5 rounded-xl border border-border bg-bg-elevated shadow-sm sm:space-y-1">
          {MORE_LINKS.map(({ href, label, icon: Icon }) => (
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
          <li>
            <Link
              href="/dashboard/feedback"
              className="flex min-h-[44px] items-center gap-3 px-4 py-3 text-sm font-medium text-text hover:bg-bg-subtle transition-colors active:bg-bg-muted touch-manipulation"
            >
              <IconMessageCircle className="h-4 w-4 shrink-0 text-text-muted" size={16} />
              Share feedback
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

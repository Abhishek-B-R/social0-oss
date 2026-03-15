import Link from "next/link";
import {
  IconSettings,
  IconStack2,
  IconList,
  IconClock,
  IconCircleCheck,
  IconFileText,
  IconFiles,
  IconUsers,
  IconCreditCard,
  IconMessageCircle,
} from "@tabler/icons-react";
import { DOCS_MORE_URL } from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";

const MANUAL_POSTING_LINKS = [
  { href: "/dashboard/create", label: "Manual setup", icon: IconFiles },
] as const;

const MORE_LINKS = [
  { href: "/dashboard/bulk-tools", label: "Bulk tools", icon: IconStack2 },
  { href: "/dashboard/posts", label: "All posts", icon: IconList },
  { href: "/dashboard/posts/scheduled", label: "Scheduled", icon: IconClock },
  { href: "/dashboard/posts/posted", label: "Posted", icon: IconCircleCheck },
  { href: "/dashboard/posts/drafts", label: "Drafts", icon: IconFileText },
  { href: "/dashboard/teams", label: "Teams", icon: IconUsers },
  { href: "/dashboard/settings", label: "Settings", icon: IconSettings },
  { href: "/dashboard/billing", label: "Billing", icon: IconCreditCard },
] as const;

export default function MorePage() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          More
        </h1>
        <DocsInfoIcon url={DOCS_MORE_URL} />
      </div>
      <p className="mt-2 text-text-muted">
        Settings and the rest of the dashboard.
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
          Manual posting
        </h2>
        <ul className="space-y-1 rounded-xl border border-border bg-bg-elevated shadow-sm">
          {MANUAL_POSTING_LINKS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-text hover:bg-bg-subtle transition-colors"
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
        <ul className="space-y-1 rounded-xl border border-border bg-bg-elevated shadow-sm">
          {MORE_LINKS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-text hover:bg-bg-subtle transition-colors"
              >
                <Icon className="h-4 w-4 shrink-0 text-text-muted" />
                {label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-text hover:bg-bg-subtle transition-colors"
            >
              <IconMessageCircle
                className="h-4 w-4 shrink-0 text-text-muted"
                size={16}
              />
              Share feedback
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

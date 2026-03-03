import Link from "next/link";
import {
  Settings,
  Layers,
  List,
  Clock,
  CheckCircle,
  FileText,
  Users,
  CreditCard,
  MessageCircle,
  FileStack,
} from "lucide-react";

const MANUAL_POSTING_LINKS = [
  { href: "/dashboard/create", label: "Manual setup", icon: FileStack },
] as const;

const MORE_LINKS = [
  { href: "/dashboard/bulk-tools", label: "Bulk tools", icon: Layers },
  { href: "/dashboard/posts", label: "All posts", icon: List },
  { href: "/dashboard/posts/scheduled", label: "Scheduled", icon: Clock },
  { href: "/dashboard/posts/posted", label: "Posted", icon: CheckCircle },
  { href: "/dashboard/posts/drafts", label: "Drafts", icon: FileText },
  { href: "/dashboard/teams", label: "Teams", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
] as const;

export default function MorePage() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold text-text">More</h1>
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
              <MessageCircle className="h-4 w-4 shrink-0 text-text-muted" />
              Share feedback
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

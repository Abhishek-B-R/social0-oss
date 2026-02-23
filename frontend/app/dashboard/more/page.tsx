import Link from "next/link";
import {
  Settings,
  Layers,
  Calendar,
  List,
  Clock,
  CheckCircle,
  FileText,
  Users,
  CreditCard,
  MessageCircle,
} from "lucide-react";

const MORE_LINKS = [
  { href: "/dashboard/bulk-tools", label: "Bulk tools", icon: Layers },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
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
      <h1 className="text-2xl font-extrabold text-gray-900">More</h1>
      <p className="mt-2 text-gray-500">
        Settings and the rest of the dashboard.
      </p>
      <ul className="mt-6 space-y-1 rounded-xl border border-gray-200 bg-white shadow-sm">
        {MORE_LINKS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <Icon className="h-4 w-4 shrink-0 text-gray-500" />
              {label}
            </Link>
          </li>
        ))}
        <li>
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
          >
            <MessageCircle className="h-4 w-4 shrink-0 text-gray-500" />
            Share feedback
          </a>
        </li>
      </ul>
    </div>
  );
}

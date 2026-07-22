
import { useNavigate, useSearchParams } from "react-router-dom";
import { Filter } from "lucide-react";

type Option = { value: string; label: string };

const SORT_OPTIONS: Option[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

const TIME_OPTIONS: Option[] = [
  { value: "all", label: "All time" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export function AllPostsFilters({
  platformOptions,
  accountOptions,
  basePath = "/dashboard/posts",
}: {
  platformOptions: Option[];
  accountOptions: Option[];
  basePath?: string;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sort = searchParams.get("sort") || "newest";
  const platform = searchParams.get("platform") || "all";
  const time = searchParams.get("time") || "all";
  const account = searchParams.get("account") || "all";

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all" || !value) next.delete(key);
    else next.set(key, value);
    next.delete("page"); // reset to page 1 when filters change
    navigate(`${basePath}?${next.toString()}`);
  };

  const selectClass =
    "min-h-[44px] rounded-lg border border-input bg-bg px-3 py-2.5 text-sm text-text shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 touch-manipulation sm:min-h-0 sm:py-2";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 shrink-0 text-text-muted" />
      <select
        value={sort}
        onChange={(e) => update("sort", e.target.value)}
        className={selectClass}
        aria-label="Sort order"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={platform}
        onChange={(e) => update("platform", e.target.value)}
        className={selectClass}
        aria-label="Filter by platform"
      >
        <option value="all">All platforms</option>
        {platformOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={time}
        onChange={(e) => update("time", e.target.value)}
        className={selectClass}
        aria-label="Filter by time"
      >
        {TIME_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={account}
        onChange={(e) => update("account", e.target.value)}
        className={selectClass}
        aria-label="Filter by account"
      >
        <option value="all">All accounts</option>
        {accountOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

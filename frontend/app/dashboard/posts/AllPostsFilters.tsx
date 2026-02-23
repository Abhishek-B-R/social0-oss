"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, ChevronDown } from "lucide-react";

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
  const router = useRouter();
  const searchParams = useSearchParams();

  const sort = searchParams.get("sort") || "newest";
  const platform = searchParams.get("platform") || "all";
  const time = searchParams.get("time") || "all";
  const account = searchParams.get("account") || "all";

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all" || !value) next.delete(key);
    else next.set(key, value);
    router.push(`${basePath}?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-gray-500" />
      <select
        value={sort}
        onChange={(e) => update("sort", e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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

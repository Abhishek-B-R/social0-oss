"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 12;

export type PaginationProps = {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
};

/**
 * Builds the URL for a given page, preserving all existing search params (platform, account, sort, etc.).
 */
export function buildPaginationUrl(
  basePath: string,
  page: number,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else if (value != null && value !== "") {
      params.set(key, value);
    }
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  searchParams,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const page = Math.max(1, Math.min(currentPage, totalPages));
  const prevPage = page - 1;
  const nextPage = page + 1;
  const prevHref = buildPaginationUrl(basePath, prevPage, searchParams);
  const nextHref = buildPaginationUrl(basePath, nextPage, searchParams);
  const displayPage = page;
  const buttonClass =
    "inline-flex items-center gap-1 rounded-lg border border-input bg-bg px-3 py-2 text-sm font-medium text-text shadow-sm transition-colors hover:bg-bg-muted disabled:pointer-events-none disabled:opacity-50";

  return (
    <nav
      className="flex items-center justify-center gap-4 py-6"
      aria-label="Pagination"
    >
      {displayPage <= 1 ? (
        <span
          className={buttonClass}
          aria-disabled
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </span>
      ) : (
        <Link
          href={prevHref}
          className={buttonClass}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Link>
      )}

      <span className="text-sm text-text-muted">
        Page {displayPage} of {totalPages}
      </span>

      {displayPage >= totalPages ? (
        <span
          className={buttonClass}
          aria-disabled
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </span>
      ) : (
        <Link
          href={nextHref}
          className={buttonClass}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </nav>
  );
}

export { PAGE_SIZE };

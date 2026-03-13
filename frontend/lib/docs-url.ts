/**
 * Base URL for the Social0 docs site. Used for links to fair usage, billing, etc.
 * Set NEXT_PUBLIC_DOCS_URL in .env.local (e.g. https://docs.social0.app or http://localhost:3001 for local docs).
 */
export const DOCS_BASE_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DOCS_URL) ||
  "https://docs.social0.app";

/** Fair usage policy page (Twitter/X tweet limits per plan). */
export const DOCS_FAIR_USAGE_URL = `${DOCS_BASE_URL}/docs/billing/fair-usage`;

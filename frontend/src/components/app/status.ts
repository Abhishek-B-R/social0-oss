/**
 * One vocabulary for post / delivery / account state across the dashboard.
 * Labels follow SPEC §2: Draft, Needs review, Scheduled, Publishing,
 * Published, Partly published, Failed (+ account Healthy / Sign-in expired).
 */

export type PillStatus =
  | "draft"
  | "needs_review"
  | "scheduled"
  | "publishing"
  | "published"
  | "partly_published"
  | "failed"
  | "healthy"
  | "sign_in_expired";

export const PILL_STATUS_LABEL: Record<PillStatus, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  partly_published: "Partly published",
  failed: "Failed",
  healthy: "Healthy",
  sign_in_expired: "Sign-in expired",
};

/**
 * Map a raw post/publication status from the API to a pill status.
 * `isAgentDraft` turns a draft created by an API key / MCP client into
 * "Needs review". Unknown values fall back to "draft".
 */
export function toPillStatus(
  raw: string | null | undefined,
  opts?: { isAgentDraft?: boolean },
): PillStatus {
  const s = (raw ?? "").toLowerCase().trim();
  switch (s) {
    case "draft":
      return opts?.isAgentDraft ? "needs_review" : "draft";
    case "needs_review":
    case "review":
      return "needs_review";
    case "scheduled":
    case "queued":
      return "scheduled";
    case "publishing":
    case "processing":
    case "pending":
    case "in_progress":
    case "uploading":
      return "publishing";
    case "published":
    case "posted":
    case "success":
    case "succeeded":
    case "live":
      return "published";
    case "partial":
    case "partially_published":
    case "partly_published":
      return "partly_published";
    case "failed":
    case "error":
      return "failed";
    case "expired":
    case "sign_in_expired":
      return "sign_in_expired";
    case "ok":
    case "healthy":
      return "healthy";
    default:
      return "draft";
  }
}

/** Tone of a single delivery (one publication) for dots and icons. */
export type DeliveryTone = "ok" | "failed" | "warning" | "pending" | "none";

export function deliveryTone(raw: string | null | undefined): DeliveryTone {
  const s = (raw ?? "").toLowerCase().trim();
  if (s === "ok" || s === "failed" || s === "warning" || s === "pending" || s === "none") {
    return s;
  }
  switch (toPillStatus(s)) {
    case "published":
    case "healthy":
      return "ok";
    case "failed":
      return "failed";
    case "partly_published":
    case "sign_in_expired":
      return "warning";
    case "scheduled":
    case "publishing":
    case "needs_review":
      return "pending";
    default:
      return "none";
  }
}

/** "2 of 3 delivered" helper for publication lists. */
export function deliverySummary(
  statuses: Array<string | null | undefined>,
): { delivered: number; total: number; failed: number; label: string } {
  const total = statuses.length;
  let delivered = 0;
  let failed = 0;
  for (const s of statuses) {
    const tone = deliveryTone(s);
    if (tone === "ok") delivered += 1;
    else if (tone === "failed") failed += 1;
  }
  return {
    delivered,
    total,
    failed,
    label: total === 0 ? "" : `${delivered} of ${total} delivered`,
  };
}

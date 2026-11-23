/**
 * Shared names for dashboard URL state, so every section agrees on one
 * spelling. Paths are *relative* to the workspace base; build links with
 * `useDashboardPath()` (`dash("posts?tab=failed")`).
 */

/** `/posts?tab=…` — Posts page status tabs. Absent = "all". */
export const POSTS_TABS = [
  "all",
  "drafts",
  "review",
  "scheduled",
  "published",
  "failed",
] as const;
export type PostsTab = (typeof POSTS_TABS)[number];

export const POSTS_TAB_LABELS: Record<PostsTab, string> = {
  all: "All",
  drafts: "Drafts",
  review: "Needs review",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
};

/** Old `/posts/<segment>` routes → `?tab=` value. */
export const LEGACY_POSTS_SEGMENT_TO_TAB: Record<string, PostsTab> = {
  drafts: "drafts",
  scheduled: "scheduled",
  posted: "published",
};

/** `/agents?tab=…` — AI agents page tabs. Absent = "agents". */
export const AGENTS_TABS = ["agents", "keys", "webhooks"] as const;
export type AgentsTab = (typeof AGENTS_TABS)[number];

export const AGENTS_TAB_LABELS: Record<AgentsTab, string> = {
  agents: "Agents",
  keys: "API keys",
  webhooks: "Webhooks",
};

/** `/settings/:section`. Absent section = "profile". */
export const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile", group: "Account" },
  { id: "notifications", label: "Notifications", group: "Account" },
  { id: "security", label: "Security", group: "Account" },
  { id: "general", label: "General & timezone", group: "Workspace" },
  { id: "schedule", label: "Posting schedule", group: "Workspace" },
  { id: "members", label: "Members", group: "Workspace" },
  { id: "billing", label: "Billing", group: "Workspace" },
  { id: "workspaces", label: "Workspaces", group: "Workspace" },
] as const;

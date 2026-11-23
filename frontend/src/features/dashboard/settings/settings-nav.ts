import type { ComponentType } from "react";
import {
  Bell,
  CalendarBlank,
  Clock,
  CreditCard,
  Key,
  Robot,
  ShieldCheck,
  SquaresFour,
  User,
  Users,
  WebhooksLogo,
} from "@/icons/phosphor";
import { SETTINGS_SECTIONS } from "@/lib/dashboard-routes";

/**
 * Settings sections rendered inside the settings shell: the shared list in
 * `@/lib/dashboard-routes` that other pages link to ("workspaces" is all
 * workspaces, moved here from /dashboard/workspaces).
 */
export const SETTINGS_PAGE_IDS = SETTINGS_SECTIONS.map((s) => s.id);
export type SettingsPageId = (typeof SETTINGS_PAGE_IDS)[number];

export function isSettingsPageId(v: string | undefined): v is SettingsPageId {
  return !!v && (SETTINGS_PAGE_IDS as readonly string[]).includes(v);
}

/** Section ids that are really links to another page (typed URLs still work). */
export const SETTINGS_LINK_SECTIONS: Record<string, string> = {
  accounts: "connections",
  connections: "connections",
  agents: "agents",
  "ai-agents": "agents",
  "api-keys": "agents?tab=keys",
  keys: "agents?tab=keys",
  webhooks: "agents?tab=webhooks",
};

/** Old `#hash` tabs on /dashboard/settings → new section (or link). */
export const LEGACY_SETTINGS_HASH: Record<string, SettingsPageId | { link: string }> = {
  profile: "profile",
  preferences: "general",
  queue: "schedule",
  queues: "schedule",
  connections: { link: "connections" },
};

/** Old section names typed as paths (/settings/queue) → new id. */
export const LEGACY_SETTINGS_PATH: Record<string, SettingsPageId> = {
  preferences: "general",
  queue: "schedule",
  queues: "schedule",
  timezone: "general",
  team: "members",
  teams: "members",
};

export const SETTINGS_PAGE_LABEL: Record<SettingsPageId, string> = {
  profile: "Profile",
  notifications: "Notifications",
  security: "Security",
  general: "General & timezone",
  schedule: "Posting schedule",
  members: "Members",
  billing: "Billing",
  workspaces: "Workspaces",
};

type NavIcon = ComponentType<{ className?: string; size?: number; weight?: "regular" | "fill" }>;

const SETTINGS_PAGE_ICON: Record<SettingsPageId, NavIcon> = {
  profile: User,
  notifications: Bell,
  security: ShieldCheck,
  general: Clock,
  schedule: CalendarBlank,
  members: Users,
  billing: CreditCard,
  workspaces: SquaresFour,
};

export type SettingsNavItem =
  | { kind: "section"; id: SettingsPageId; label: string; icon: NavIcon }
  | { kind: "link"; key: string; label: string; to: string; icon: NavIcon };

export type SettingsNavGroup = { key: string; label: string; items: SettingsNavItem[] };

const section = (id: SettingsPageId): SettingsNavItem => ({
  kind: "section",
  id,
  label: SETTINGS_PAGE_LABEL[id],
  icon: SETTINGS_PAGE_ICON[id],
});

/**
 * Grouped nav. `workspaceName` labels the Workspace group ("Workspace · Main").
 * Accounts lives in the main app nav, so it is not repeated here. Developers
 * items are tabs of the AI agents page (plain links, no "leaves settings" arrow).
 */
export function buildSettingsNav(workspaceName: string): SettingsNavGroup[] {
  return [
    {
      key: "account",
      label: "Account",
      items: [section("profile"), section("notifications"), section("security")],
    },
    {
      key: "workspace",
      label: `Workspace · ${workspaceName}`,
      items: [
        section("general"),
        section("schedule"),
        section("members"),
        section("billing"),
        section("workspaces"),
      ],
    },
    {
      key: "developers",
      label: "Developers",
      items: [
        { kind: "link", key: "agents", label: "AI agents", to: "agents", icon: Robot },
        { kind: "link", key: "keys", label: "API keys", to: "agents?tab=keys", icon: Key },
        { kind: "link", key: "webhooks", label: "Webhooks", to: "agents?tab=webhooks", icon: WebhooksLogo },
      ],
    },
  ];
}

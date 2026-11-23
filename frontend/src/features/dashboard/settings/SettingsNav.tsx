import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import { useDashboardPath } from "@/components/app";
import { ArrowLeft } from "@/icons/phosphor";
import { getTeamIdFromPathname } from "@/lib/dashboard-base-path";
import { cn } from "@/lib/utils";
import {
  buildSettingsNav,
  isSettingsPageId,
  type SettingsNavGroup,
  type SettingsNavItem,
  type SettingsPageId,
} from "./settings-nav";
import { SettingsSelect } from "./settings-ui";
import { lastAppPathBeforeSettings, useSettingsWorkspace } from "./settings-workspace";

/**
 * Settings takes over the app shell: on /dashboard/settings/* and
 * /dashboard/teams/:teamId/settings/* DashboardLayout renders
 * `SettingsSidebar` (desktop) and `SettingsMobileBar` (phones) in place of
 * the app sidebar and mobile top bar. Both read the route themselves, so the
 * layout only has to swap components.
 */
function useSettingsNavModel() {
  const { pathname } = useLocation();
  const dash = useDashboardPath();
  const teamId = getTeamIdFromPathname(pathname);
  const settingsBase = teamId ? `/dashboard/teams/${teamId}/settings` : "/dashboard/settings";
  const rawSection = pathname
    .slice(settingsBase.length)
    .replace(/^\/+/, "")
    .split("/")[0]
    ?.toLowerCase();
  const active: SettingsPageId | null = rawSection
    ? isSettingsPageId(rawSection)
      ? rawSection
      : null
    : teamId
      ? "general"
      : "profile";

  const { workspaceName, workspacesQuery } = useSettingsWorkspace(teamId);
  const groups = useMemo(() => buildSettingsNav(workspaceName), [workspaceName]);
  // The remembered page can sit inside a team the user has since left or
  // deleted (deleting a solo workspace deletes its team too); Back would then
  // land on "Team not found". Once the list is loaded, only keep team pages
  // for teams the user still belongs to.
  const remembered = lastAppPathBeforeSettings();
  const rememberedTeamId = remembered ? getTeamIdFromPathname(remembered) : null;
  const teams = workspacesQuery.data?.teams;
  const rememberedIsGone =
    !!rememberedTeamId && !!teams && !teams.some((t) => t.id === rememberedTeamId);
  const backHref = remembered && !rememberedIsGone ? remembered : dash("home");

  const hrefFor = (item: SettingsNavItem) =>
    item.kind === "section" ? `${settingsBase}/${item.id}` : dash(item.to);

  return { groups, active, backHref, hrefFor };
}

const itemKey = (item: SettingsNavItem) => (item.kind === "section" ? item.id : item.key);

/** Desktop: same width and place as the app sidebar. */
export function SettingsSidebar() {
  const { groups, active, backHref, hrefFor } = useSettingsNavModel();
  return (
    <aside
      aria-label="Settings"
      className="relative z-10 hidden h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg lg:flex"
    >
      <div className="shrink-0 p-3">
        <Link
          href={backHref}
          className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-active hover:text-sidebar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to app
        </Link>
      </div>
      <nav aria-label="Settings sections" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <SidebarGroup key={g.key} group={g} active={active} hrefFor={hrefFor} />
        ))}
      </nav>
    </aside>
  );
}

function SidebarGroup({
  group,
  active,
  hrefFor,
}: {
  group: SettingsNavGroup;
  active: SettingsPageId | null;
  hrefFor: (item: SettingsNavItem) => string;
}) {
  return (
    <div>
      <p className="truncate px-3 pb-1 pt-4 text-xs font-medium text-sidebar-muted" title={group.label}>
        {group.label}
      </p>
      <ul className="space-y-px">
        {group.items.map((item) => {
          const isActive = item.kind === "section" && item.id === active;
          const Icon = item.icon;
          return (
            <li key={itemKey(item)}>
              <Link
                href={hrefFor(item)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-[7px] text-sm font-medium text-sidebar-text transition-colors duration-150",
                  "hover:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  isActive && "bg-sidebar-active",
                )}
              >
                <Icon
                  size={16}
                  weight={isActive ? "fill" : "regular"}
                  className={cn("size-4 shrink-0", !isActive && "text-sidebar-muted")}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Phones / tablets: back + one section picker, sticky at the top. */
export function SettingsMobileBar() {
  const { groups, active, backHref, hrefFor } = useSettingsNavModel();
  const navigate = useNavigate();
  const items = groups.flatMap((g) => g.items);

  return (
    <div className="sticky top-0 z-30 flex items-center gap-1 border-b border-border bg-bg/90 px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] backdrop-blur supports-[backdrop-filter]:bg-bg/75 lg:hidden">
      <Link
        href={backHref}
        aria-label="Back to app"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-text-muted active:bg-bg-muted"
      >
        <ArrowLeft size={20} aria-hidden />
      </Link>
      <label htmlFor="settings-section-picker" className="sr-only">
        Settings section
      </label>
      <SettingsSelect
        id="settings-section-picker"
        className="min-w-0 flex-1"
        value={active ?? ""}
        onChange={(e) => {
          const item = items.find((i) => itemKey(i) === e.target.value);
          if (item) navigate(hrefFor(item));
        }}
      >
        {active ? null : <option value="">Settings</option>}
        {groups.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {g.items.map((item) => (
              <option key={itemKey(item)} value={itemKey(item)}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </SettingsSelect>
    </div>
  );
}

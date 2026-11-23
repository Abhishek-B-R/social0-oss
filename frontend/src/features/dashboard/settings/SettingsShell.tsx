import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import Link from "@/components/AppLink";
import { Banner, PageContainer, PageHeader, useDashboardPath } from "@/components/app";
import { buttonVariants } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { cn } from "@/lib/utils";
import { SaveIndicator, SaveStatusProvider } from "./SaveStatus";
import { SettingsHeaderSlotContext } from "./header-slot-context";
import {
  LEGACY_SETTINGS_HASH,
  LEGACY_SETTINGS_PATH,
  SETTINGS_LINK_SECTIONS,
  SETTINGS_PAGE_LABEL,
  isSettingsPageId,
  type SettingsPageId,
} from "./settings-nav";
import { SettingsScopeContext, type SettingsScope } from "./settings-scope";
import { useSettingsWorkspace } from "./settings-workspace";
import { NotificationsSection } from "./sections/NotificationsSection";
import { PostingScheduleSection } from "./sections/PostingScheduleSection";
import { ProfileSection } from "./sections/ProfileSection";
import { SecuritySection } from "./sections/SecuritySection";
import {
  BillingSection,
  GeneralSection,
  MembersSection,
  WorkspacesSection,
} from "./sections/WorkspaceSections";

/** Sections whose content is about the workspace (paused-team banner applies). */
const WORKSPACE_SECTIONS = new Set<SettingsPageId>(["general", "schedule", "members"]);

/** Sections with nothing to autosave: no "Saved" indicator. */
const NO_AUTOSAVE = new Set<SettingsPageId>(["security", "billing", "workspaces"]);

/**
 * One settings page. The grouped nav (Account · Workspace · Developers) is
 * not in here: DashboardLayout swaps the app sidebar for `SettingsSidebar`
 * (and the phone top bar for `SettingsMobileBar`) on settings routes. This
 * renders the content column only: title, then borderless sections.
 *
 * Routes: /dashboard/settings[/:section] (personal, Main) and
 * /dashboard/teams/:teamId/settings[/:section] (that team). Old `#queue`,
 * `#preferences`, `#connections`, `#profile` hashes redirect.
 */
export function SettingsShell() {
  const params = useParams<{ teamId?: string; section?: string }>();
  const teamId = params.teamId && params.teamId !== "create" ? params.teamId : null;
  const rawSection = params.section?.toLowerCase();
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const { data: session, isPending: sessionPending } = useSession();
  // The header's action area: sections portal their primary button into it.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const headerSlotValue = useMemo(() => ({ slot: headerSlot }), [headerSlot]);

  const { workspacesQuery, teamQuery, teamListItem, isSolo, workspaceName } =
    useSettingsWorkspace(teamId);

  // Settings need an account (the dashboard is browsable as a guest).
  useEffect(() => {
    if (!sessionPending && !session) {
      navigate(signInUrl(`${pathname}${search}`), { replace: true });
    }
  }, [sessionPending, session, navigate, pathname, search]);

  const settingsBase = teamId ? `/dashboard/teams/${teamId}/settings` : "/dashboard/settings";

  const scope = useMemo<SettingsScope>(
    () => ({
      teamId,
      teamQuery: teamId ? teamQuery : null,
      workspacesQuery,
      teamListItem,
      isSolo,
      workspaceName,
      settingsBase,
    }),
    [teamId, teamQuery, workspacesQuery, teamListItem, isSolo, workspaceName, settingsBase],
  );

  // --- Old URLs -----------------------------------------------------------
  if (!rawSection && hash) {
    const target = LEGACY_SETTINGS_HASH[hash.slice(1).toLowerCase()];
    if (target) {
      return (
        <Navigate
          replace
          to={typeof target === "string" ? `${settingsBase}/${target}` : dash(target.link)}
        />
      );
    }
  }
  if (rawSection && SETTINGS_LINK_SECTIONS[rawSection]) {
    return <Navigate replace to={dash(SETTINGS_LINK_SECTIONS[rawSection])} />;
  }
  if (rawSection && LEGACY_SETTINGS_PATH[rawSection]) {
    return <Navigate replace to={`${settingsBase}/${LEGACY_SETTINGS_PATH[rawSection]}${search}`} />;
  }
  if (rawSection && !isSettingsPageId(rawSection)) {
    return <Navigate replace to={settingsBase} />;
  }

  if (sessionPending || !session) return null;

  const active: SettingsPageId = rawSection && isSettingsPageId(rawSection)
    ? rawSection
    : teamId
      ? "general"
      : "profile";

  const team = teamQuery.data;
  const paused = !!teamId && !isSolo && !!team?.team && !team.teamsEnabled && WORKSPACE_SECTIONS.has(active);

  return (
    <SettingsScopeContext.Provider value={scope}>
      {/* Same full column as every other dashboard page; rows cap their own controls. */}
      <PageContainer>
        <SaveStatusProvider key={`${teamId ?? "main"}:${active}`}>
          <SettingsHeaderSlotContext.Provider value={headerSlotValue}>
            <PageHeader
              title={SETTINGS_PAGE_LABEL[active]}
              actions={
                <>
                  {NO_AUTOSAVE.has(active) ? null : <SaveIndicator />}
                  <span ref={setHeaderSlot} className="contents" />
                </>
              }
            />
            {paused ? (
              <Banner
                tier="blocking"
                title="Teams is paused."
                className="mb-6"
                actions={
                  team?.isOwner ? (
                    <Link
                      href="/dashboard/settings/billing"
                      className={cn(buttonVariants({ size: "sm" }))}
                    >
                      Renew plan
                    </Link>
                  ) : null
                }
              >
                {team?.isOwner
                  ? "This team's plan has lapsed, so invites and shared access are off. Renew to turn them back on."
                  : "This team's plan has lapsed. Ask the team owner to renew it."}
              </Banner>
            ) : null}
            <SectionBody id={active} />
          </SettingsHeaderSlotContext.Provider>
        </SaveStatusProvider>
      </PageContainer>
    </SettingsScopeContext.Provider>
  );
}

function SectionBody({ id }: { id: SettingsPageId }) {
  switch (id) {
    case "profile":
      return <ProfileSection />;
    case "notifications":
      return <NotificationsSection />;
    case "security":
      return <SecuritySection />;
    case "general":
      return <GeneralSection />;
    case "schedule":
      return <PostingScheduleSection />;
    case "members":
      return <MembersSection />;
    case "billing":
      return <BillingSection />;
    case "workspaces":
      return <WorkspacesSection />;
  }
}

export default SettingsShell;

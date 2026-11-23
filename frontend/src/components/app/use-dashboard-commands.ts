import { useMemo, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AtSign,
  Bot,
  Calendar,
  ChartLine,
  Clock,
  CreditCard,
  FileText,
  House,
  Inbox,
  Key,
  Layers,
  Megaphone,
  Plug,
  Settings,
  SquarePen,
  UserPlus,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { getTeamById, listWorkspaces } from "@/api/team";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import { useSession } from "@/lib/auth-client";
import { teamQueryKey, WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import {
  AGENTS_TAB_LABELS,
  POSTS_TAB_LABELS,
  SETTINGS_SECTIONS,
} from "@/lib/dashboard-routes";
import { openComposer, useComposerActive } from "./composer-bus";
import { useAccountHealth } from "./use-account-health";
import { useDashboardPath, useTeamId } from "./use-dashboard-path";

export type CommandGroup = "Actions" | "Go to" | "Posts";

export type Command = {
  id: string;
  group: CommandGroup;
  label: string;
  /** Extra search terms. */
  keywords?: string;
  /** Shortcut hint, shortcut syntax ("c", "g h"). */
  keys?: string;
  icon?: ComponentType<{ className?: string }>;
  run: () => void;
};

/**
 * Static actions + navigation for the ⌘K palette, filtered by role
 * (no "New post" for analysts/community, no Inbox for analysts, …).
 */
export function useDashboardCommands(): Command[] {
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const teamId = useTeamId();
  const perms = useWorkspaceNavPermissions();
  // Optimistic while loading so the palette isn't empty on first open.
  const canCreate = !perms.ready || perms.canCreatePosts;
  const canAnalytics = !perms.ready || perms.canViewAnalytics;
  const canInbox = !perms.ready || perms.canViewInbox;
  // On the full-page composer the compose actions would do nothing (one
  // composer at a time), so they're left out.
  const composerActive = useComposerActive();
  const canCompose = canCreate && !composerActive;
  // Same gate as the sidebar's "Connect account" (true while loading).
  const { canManageConnections } = useAccountHealth();

  // "Invite teammate" only where the members page would actually offer it:
  // a collaborative team (not a solo workspace container), teams enabled on
  // the owner's plan, and a role allowed to invite. Same caches as Settings.
  const { data: session } = useSession();
  const teamQuery = useQuery({
    queryKey: teamQueryKey(teamId ?? "none"),
    queryFn: () => getTeamById(teamId!),
    enabled: !!session && !!teamId,
  });
  const workspacesQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: !!session && !!teamId,
  });
  const isCollaborative =
    workspacesQuery.data?.teams.find((t) => t.id === teamId)?.isCollaborative ?? false;
  const canInviteHere =
    !!teamId &&
    isCollaborative &&
    !!teamQuery.data?.teamsEnabled &&
    !!teamQuery.data?.permissions.canInvite;

  return useMemo(() => {
    const go = (path: string) => () => navigate(path);
    const cmds: Command[] = [];

    if (canCompose) {
      cmds.push(
        {
          id: "new-post",
          group: "Actions",
          label: "New post",
          keywords: "write create compose",
          keys: "c",
          icon: SquarePen,
          run: () => openComposer(),
        },
        {
          id: "schedule-post",
          group: "Actions",
          label: "Schedule a post",
          keywords: "later queue time",
          icon: Clock,
          run: () => openComposer({ intent: "schedule" }),
        },
      );
    }
    if (canManageConnections) {
      cmds.push({
        id: "connect-account",
        group: "Actions",
        label: "Connect account",
        keywords: "add network instagram tiktok x linkedin youtube",
        icon: Plug,
        run: go(dash("connections?connect=1")),
      });
    }
    if (canInviteHere) {
      cmds.push({
        id: "invite",
        group: "Actions",
        label: "Invite teammate",
        keywords: "invite member people team",
        icon: UserPlus,
        run: go(dash("settings/members?invite=1")),
      });
    } else if (!teamId) {
      cmds.push({
        id: "create-team",
        group: "Actions",
        label: "Create a team",
        keywords: "invite member people team",
        icon: UserPlus,
        run: go("/dashboard/teams/create"),
      });
    }

    const nav = (
      id: string,
      label: string,
      path: string,
      icon: Command["icon"],
      extra?: Partial<Command>,
    ): Command => ({ id, group: "Go to", label, icon, run: go(path), ...extra });

    cmds.push(nav("go-home", "Home", dash("home"), House, { keys: "g h" }));
    if (canInbox) {
      cmds.push(
        nav("go-inbox", "Inbox", dash("inbox"), Inbox, {
          keys: "g i",
          keywords: "comments dms replies messages",
        }),
      );
    }
    cmds.push(nav("go-calendar", "Calendar", dash("calendar"), Calendar, { keys: "g c" }));
    cmds.push(nav("go-posts", "Posts", dash("posts"), FileText, { keys: "g p" }));
    for (const tab of ["drafts", "review", "scheduled", "published", "failed"] as const) {
      cmds.push(
        nav(`go-posts-${tab}`, `Posts › ${POSTS_TAB_LABELS[tab]}`, dash(`posts?tab=${tab}`), FileText),
      );
    }
    if (canAnalytics) {
      cmds.push(
        nav("go-analytics", "Analytics", dash("analytics"), ChartLine, {
          keys: "g a",
          keywords: "metrics stats performance",
        }),
      );
    }
    cmds.push(
      nav("go-automations", "Automations", dash("automations"), Zap, {
        keywords: "autoplug resurface repost rules",
      }),
    );
    if (canCreate) {
      cmds.push(
        nav("go-bulk", "Bulk import", dash("bulk-tools"), Layers, {
          keywords: "bulk tools csv upload many",
        }),
      );
    }
    cmds.push(
      nav("go-accounts", "Accounts", dash("connections"), AtSign, {
        keywords: "connections reconnect networks",
      }),
    );
    cmds.push(
      nav("go-agents", "AI agents", dash("agents"), Bot, {
        keywords: "mcp chatgpt claude cursor developers",
      }),
      nav("go-agents-keys", `AI agents › ${AGENTS_TAB_LABELS.keys}`, dash("agents?tab=keys"), Key, {
        keywords: "api key token developer",
      }),
      nav(
        "go-agents-webhooks",
        `AI agents › ${AGENTS_TAB_LABELS.webhooks}`,
        dash("agents?tab=webhooks"),
        Webhook,
      ),
    );
    cmds.push(nav("go-settings", "Settings", dash("settings"), Settings));
    for (const s of SETTINGS_SECTIONS) {
      if (s.id === "members" && !teamId) continue;
      const path =
        s.group === "Account" || s.id === "billing" || s.id === "workspaces"
          ? `/dashboard/settings/${s.id}`
          : dash(`settings/${s.id}`);
      cmds.push(
        nav(`go-settings-${s.id}`, `Settings › ${s.label}`, path, Settings, {
          keywords: s.id === "schedule" ? "queue slots timezone" : undefined,
        }),
      );
    }
    cmds.push(
      nav("go-billing", "Billing", "/dashboard/billing", CreditCard, {
        keywords: "plan upgrade invoice subscription",
      }),
      nav("go-teams", "Teams", "/dashboard/settings/members", Users, {
        keywords: "create team invite members",
      }),
      nav("go-feedback", "Feedback", "/dashboard/feedback", Megaphone, {
        keywords: "feature request bug",
      }),
    );
    return cmds;
  }, [
    navigate,
    dash,
    teamId,
    canCreate,
    canCompose,
    canAnalytics,
    canInbox,
    canManageConnections,
    canInviteHere,
  ]);
}

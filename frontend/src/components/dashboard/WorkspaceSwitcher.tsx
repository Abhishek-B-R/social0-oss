import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconBriefcase,
  IconChevronDown,
  IconHome,
  IconPlus,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import {
  listWorkspaces,
  switchWorkspace,
  type TeamListItem,
  type WorkspaceListItem,
} from "@/api/team";
import { CreateWorkspaceDialog } from "@/features/dashboard/workspaces/CreateWorkspaceDialog";
import {
  isTeamAppPath,
  mapPathToBase,
  writePersonalWorkspaceId,
  writeTeamWorkspaceId,
} from "@/lib/dashboard-base-path";
import {
  invalidateTeamRoomQueries,
  WORKSPACES_QUERY_KEY,
} from "@/lib/team-query-keys";
import { clearTeamBootstrap } from "@/layouts/team-bootstrap";

export function WorkspaceSwitcher({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | "main" | null>(null);
  const [menuMaxHeight, setMenuMaxHeight] = useState(480);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Close the menu if the route changes underneath it (client-side nav).
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const menuWidth = 320;
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - menuWidth - 8),
      );
      setMenuPos({ top: rect.bottom + 4, left });
      const available = window.innerHeight - rect.bottom - 12;
      setMenuMaxHeight(Math.max(120, available));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const active =
    data?.workspaces.find((w) => w.isActive) ??
    ({
      id: null,
      name: "Main",
      kind: "personal",
      teamId: null,
      teamName: null,
      role: null,
      isOwner: true,
      isActive: true,
      connectionCount: 0,
      memberCount: 1,
    } satisfies WorkspaceListItem);

  const ownedTeams = useMemo(
    () => (data?.teams ?? []).filter((t) => t.kind === "owned"),
    [data?.teams],
  );
  const joinedTeams = useMemo(
    () => (data?.teams ?? []).filter((t) => t.kind === "joined"),
    [data?.teams],
  );

  const personalWorkspaces = useMemo(() => {
    const items: {
      id: string | null;
      name: string;
      subtitle: string;
      teamId: string | null;
    }[] = [
      {
        id: null,
        name: "Main",
        subtitle: "Personal",
        teamId: null,
      },
    ];
    for (const team of ownedTeams) {
      for (const ws of team.workspaces) {
        items.push({
          id: ws.id,
          name: ws.name,
          subtitle: team.isCollaborative !== false ? team.name : "Personal",
          teamId: team.id,
        });
      }
    }
    return items;
  }, [ownedTeams]);

  const joinedWorkspaces = useMemo(() => {
    const items: {
      id: string;
      name: string;
      subtitle: string;
      teamId: string;
      team: TeamListItem;
    }[] = [];
    for (const team of joinedTeams) {
      for (const ws of team.workspaces) {
        items.push({
          id: ws.id,
          name: ws.name,
          subtitle: team.name,
          teamId: team.id,
          team,
        });
      }
    }
    return items;
  }, [joinedTeams]);

  const canCreate = !!data?.canCreate;
  const canCreateTeam = !!data?.canCreateTeam;
  const ownedTeamCount = data?.ownedTeamCount ?? 0;
  const maxOwnedTeams = data?.maxOwnedTeams ?? 5;
  const collaborativeOwnedTeams = useMemo(
    () => ownedTeams.filter((t) => t.isCollaborative !== false),
    [ownedTeams],
  );
  const ownedTeamOptions = useMemo(
    () => collaborativeOwnedTeams.map((t) => ({ id: t.id, name: t.name })),
    [collaborativeOwnedTeams],
  );

  const invalidateAll = async () => {
    await invalidateTeamRoomQueries(queryClient);
  };

  const navigateToTeamWorkspace = async (opts: {
    teamId: string;
    workspaceId: string;
    team: TeamListItem;
  }) => {
    const { teamId, workspaceId } = opts;
    const alreadyOnTeam =
      isTeamAppPath(pathname) && pathname.includes(`/teams/${teamId}/`);
    if (workspaceId === active.id && alreadyOnTeam) {
      setOpen(false);
      return;
    }
    if (busyId) return;
    setBusyId(workspaceId);
    try {
      await switchWorkspace(workspaceId);
      writeTeamWorkspaceId(teamId, workspaceId);
      // Leaving a different team URL — drop its bootstrap so we don't fight.
      const currentTeamMatch = pathname.match(/\/dashboard\/teams\/([^/]+)/);
      const currentTeamId = currentTeamMatch?.[1];
      if (currentTeamId && currentTeamId !== teamId) {
        clearTeamBootstrap(currentTeamId);
      }
      setOpen(false);
      const dest = mapPathToBase(pathname, `/dashboard/teams/${teamId}`);
      const teamPrefix = `/dashboard/teams/${teamId}`;
      toast.success("Switched to team workspace");
      // Full navigation — do not invalidate while still on the previous team
      // URL or TeamAppLayout will fight the switch and snap back.
      window.location.assign(
        dest === teamPrefix || dest.startsWith(`${teamPrefix}/`)
          ? dest
          : `${teamPrefix}/composer`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to switch workspace",
      );
      setBusyId(null);
    }
  };

  /** Main (personal) only — stays on /dashboard/*. */
  const handleSelectMain = async () => {
    const alreadyPersonalPath = !isTeamAppPath(pathname);
    if (active.id === null && alreadyPersonalPath) {
      setOpen(false);
      return;
    }
    if (busyId) return;
    setBusyId("main");
    try {
      await switchWorkspace(null);
      writePersonalWorkspaceId(null);
      clearTeamBootstrap();
      setOpen(false);
      const dest = mapPathToBase(pathname, "/dashboard");
      toast.success("Switched to Main");
      // Navigate immediately after the switch. Invalidating queries first while
      // still on a team URL lets TeamAppLayout re-activate that team workspace
      // and bounce the user back (Main ↔ team loop).
      if (dest !== pathname || isTeamAppPath(pathname)) {
        window.location.assign(dest);
      } else {
        window.location.reload();
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to switch workspace",
      );
      setBusyId(null);
    }
  };

  const handleSelectOwned = async (opts: {
    teamId: string;
    workspaceId: string;
  }) => {
    const team = ownedTeams.find((t) => t.id === opts.teamId);
    if (!team) {
      toast.error("Team not found");
      return;
    }
    await navigateToTeamWorkspace({
      teamId: opts.teamId,
      workspaceId: opts.workspaceId,
      team,
    });
  };

  const handleSelectJoined = async (opts: {
    teamId: string;
    workspaceId: string;
    team: TeamListItem;
  }) => {
    await navigateToTeamWorkspace(opts);
  };

  if (!enabled) return null;

  const activeLabel = active.name;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-bg px-3 py-2 text-left text-sm font-medium text-sidebar-text transition-colors hover:bg-sidebar-active"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {active.kind === "joined" ? (
          <IconUsers
            className="h-4 w-4 shrink-0 text-sidebar-muted"
            strokeWidth={1.5}
          />
        ) : active.id === null ? (
          <IconHome
            className="h-4 w-4 shrink-0 text-sidebar-muted"
            strokeWidth={1.5}
          />
        ) : (
          <IconBriefcase
            className="h-4 w-4 shrink-0 text-sidebar-muted"
            strokeWidth={1.5}
          />
        )}
        <span className="min-w-0 flex-1 truncate capitalize">
          {activeLabel}
        </span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-sidebar-muted transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="fixed z-50 flex w-70 flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg"
          style={{
            top: menuPos.top,
            left: menuPos.left,
            maxHeight: menuMaxHeight,
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {isLoading ? (
              <p className="px-3 py-3 text-sm text-text-muted">Loading…</p>
            ) : (
              <>
                <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                  Personal
                </p>
                {personalWorkspaces.map((ws) => {
                  const onThisTeam =
                    !!ws.teamId &&
                    isTeamAppPath(pathname) &&
                    pathname.includes(`/teams/${ws.teamId}/`);
                  const isActive =
                    ws.id === null
                      ? !isTeamAppPath(pathname) && active.id === null
                      : active.id === ws.id &&
                        (onThisTeam || !isTeamAppPath(pathname));
                  return (
                    <WorkspaceOption
                      key={ws.id ?? "main"}
                      label={ws.name}
                      subtitle={ws.subtitle}
                      active={isActive}
                      busy={busyId === (ws.id ?? "main")}
                      disabled={!!busyId}
                      icon={ws.id === null ? "home" : "briefcase"}
                      onSelect={() => {
                        if (ws.id === null) {
                          void handleSelectMain();
                        } else if (ws.teamId) {
                          void handleSelectOwned({
                            teamId: ws.teamId,
                            workspaceId: ws.id,
                          });
                        }
                      }}
                    />
                  );
                })}

                {joinedWorkspaces.length > 0 ? (
                  <>
                    <div className="my-1 border-t border-border" />
                    <p className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                      <IconUsers className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Teams
                    </p>
                    {joinedWorkspaces.map((ws) => (
                      <WorkspaceOption
                        key={ws.id}
                        label={ws.name}
                        subtitle={ws.subtitle}
                        active={isTeamAppPath(pathname) && active.id === ws.id}
                        busy={busyId === ws.id}
                        disabled={!!busyId}
                        icon="users"
                        onSelect={() =>
                          void handleSelectJoined({
                            teamId: ws.teamId,
                            workspaceId: ws.id,
                            team: ws.team,
                          })
                        }
                      />
                    ))}
                  </>
                ) : null}
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-border py-1">
            <Link
              href="/dashboard/workspaces"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-sidebar-active"
            >
              <IconSettings
                className="h-4 w-4 text-text-muted"
                strokeWidth={1.5}
              />
              Manage Workspaces
            </Link>
            {canCreate ||
            canCreateTeam ||
            collaborativeOwnedTeams.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-sidebar-active"
              >
                <IconPlus
                  className="h-4 w-4 text-text-muted"
                  strokeWidth={1.5}
                />
                New Workspace
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ownedTeams={ownedTeamOptions}
        canCreate={canCreate}
        canCreateTeam={canCreateTeam}
        ownedTeamCount={ownedTeamCount}
        maxOwnedTeams={maxOwnedTeams}
        onCreated={async () => {
          setCreateOpen(false);
          await invalidateAll();
        }}
      />
    </div>
  );
}

function WorkspaceOption({
  label,
  subtitle,
  active,
  busy,
  disabled,
  icon,
  onSelect,
}: {
  label: string;
  subtitle: string;
  active: boolean;
  busy: boolean;
  disabled?: boolean;
  icon: "home" | "briefcase" | "users";
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onSelect}
      aria-busy={busy || undefined}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-[opacity,colors] duration-150 ease-out hover:bg-sidebar-active disabled:opacity-50 ${
        busy
          ? "bg-sidebar-active font-medium text-sidebar-text opacity-100"
          : active
            ? "bg-sidebar-active font-medium text-sidebar-text"
            : "text-text"
      }`}
    >
      {icon === "home" ? (
        <IconHome
          className="h-4 w-4 shrink-0 text-text-muted"
          strokeWidth={1.5}
        />
      ) : icon === "briefcase" ? (
        <IconBriefcase
          className="h-4 w-4 shrink-0 text-text-muted"
          strokeWidth={1.5}
        />
      ) : (
        <IconUsers
          className="h-4 w-4 shrink-0 text-text-muted"
          strokeWidth={1.5}
        />
      )}
      <span className="min-w-0 flex-1 truncate capitalize">
        {label}
        <span className="mt-0.5 block truncate text-xs font-normal normal-case text-text-muted">
          {busy ? "Opening…" : subtitle}
        </span>
      </span>
    </button>
  );
}

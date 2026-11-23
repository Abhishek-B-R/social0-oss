import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretUpDown, Check, GearSix, Plus } from "@/icons/phosphor";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listWorkspaces,
  switchWorkspace,
  type WorkspaceListItem,
} from "@/api/team";
import { WorkspaceIcon } from "@/lib/workspace-icons";
import { CreateWorkspaceDialog } from "@/features/dashboard/workspaces/CreateWorkspaceDialog";
import { useLimitModal } from "@/components/billing/use-limit-modal";
import {
  DASHBOARD_HOME_SEGMENT,
  getTeamIdFromPathname,
  isTeamAppPath,
  isTeamSettingsPath,
  mapPathToBase,
  writePersonalWorkspaceId,
  writeTeamWorkspaceId,
} from "@/lib/dashboard-base-path";
import {
  invalidateTeamRoomQueries,
  WORKSPACES_QUERY_KEY,
} from "@/lib/team-query-keys";
import { clearTeamBootstrap } from "@/layouts/team-bootstrap";
import { SkeletonBone } from "@/components/ui/skeleton-bone";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

type WorkspaceOptionItem = {
  id: string | null;
  name: string;
  teamId: string | null;
  icon: string;
};

type WorkspaceGroup = {
  key: string;
  title: string;
  items: WorkspaceOptionItem[];
};

const MAIN_FALLBACK: WorkspaceListItem = {
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
  icon: "house",
};

/**
 * Workspace data + switch actions shared by the sidebar dropdown and the
 * mobile bottom sheet. Switching still does a full navigation: invalidating
 * while on the previous team URL lets TeamAppLayout fight the switch.
 */
function useWorkspaceSwitching(enabled: boolean) {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const [busyId, setBusyId] = useState<string | "main" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled,
  });

  const active = data?.workspaces.find((w) => w.isActive) ?? MAIN_FALLBACK;
  // Team settings sit behind the team gate too, so they count as "in the team".
  const onTeamApp = isTeamAppPath(pathname) || isTeamSettingsPath(pathname);
  const currentTeamId = getTeamIdFromPathname(pathname);

  /** Personal: Main + solo workspaces. Then one group per collaborative team. */
  const groups = useMemo<WorkspaceGroup[]>(() => {
    const personal: WorkspaceOptionItem[] = [
      { id: null, name: "Main", teamId: null, icon: "house" },
    ];
    const teamGroups: WorkspaceGroup[] = [];
    for (const team of data?.teams ?? []) {
      const items = team.workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        teamId: team.id,
        icon: ws.icon ?? (team.kind === "joined" ? "users" : "briefcase"),
      }));
      if (team.kind === "owned" && team.isCollaborative === false) {
        personal.push(...items);
      } else if (items.length > 0) {
        teamGroups.push({ key: team.id, title: team.name, items });
      }
    }
    return [{ key: "personal", title: "Personal", items: personal }, ...teamGroups];
  }, [data?.teams]);

  const isActiveItem = (ws: WorkspaceOptionItem) => {
    if (ws.id === null) return !onTeamApp && active.id === null;
    const onThisTeam = onTeamApp && currentTeamId === ws.teamId;
    return active.id === ws.id && (onThisTeam || !onTeamApp);
  };

  const selectMain = async (onDone: () => void) => {
    if (active.id === null && !onTeamApp) {
      onDone();
      return;
    }
    if (busyId) return;
    setBusyId("main");
    try {
      await switchWorkspace(null);
      writePersonalWorkspaceId(null);
      clearTeamBootstrap();
      onDone();
      const dest = mapPathToBase(pathname, "/dashboard");
      toast.success("Switched to Main");
      if (dest !== pathname || onTeamApp) window.location.assign(dest);
      else window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch workspace. Try again.");
      setBusyId(null);
    }
  };

  const selectTeamWorkspace = async (
    teamId: string,
    workspaceId: string,
    onDone: () => void,
  ) => {
    if (workspaceId === active.id && onTeamApp && currentTeamId === teamId) {
      onDone();
      return;
    }
    if (busyId) return;
    setBusyId(workspaceId);
    try {
      await switchWorkspace(workspaceId);
      writeTeamWorkspaceId(teamId, workspaceId);
      if (currentTeamId && currentTeamId !== teamId) clearTeamBootstrap(currentTeamId);
      onDone();
      const teamBase = `/dashboard/teams/${teamId}`;
      const dest = mapPathToBase(pathname, teamBase);
      toast.success("Switched workspace");
      window.location.assign(
        dest === teamBase || dest.startsWith(`${teamBase}/`)
          ? dest
          : `${teamBase}/${DASHBOARD_HOME_SEGMENT}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch workspace. Try again.");
      setBusyId(null);
    }
  };

  const select = (ws: WorkspaceOptionItem, onDone: () => void) => {
    if (ws.id === null) void selectMain(onDone);
    else if (ws.teamId) void selectTeamWorkspace(ws.teamId, ws.id, onDone);
  };

  const ownedCollaborative = (data?.teams ?? []).filter(
    (t) => t.kind === "owned" && t.isCollaborative !== false,
  );

  return {
    data,
    isLoading,
    active,
    groups,
    busyId,
    isActiveItem,
    select,
    invalidateAll: () => invalidateTeamRoomQueries(queryClient),
    createDialogProps: {
      ownedTeams: ownedCollaborative.map((t) => ({ id: t.id, name: t.name })),
      canCreate: !!data?.canCreate,
      canCreateTeam: !!data?.canCreateTeam,
      ownedTeamCount: data?.ownedTeamCount ?? 0,
      maxOwnedTeams: data?.maxOwnedTeams ?? 5,
    },
  };
}

type Switching = ReturnType<typeof useWorkspaceSwitching>;

function WorkspaceMenuList({
  sw,
  planName,
  onDone,
  onCreate,
  manageHref,
  tone,
}: {
  sw: Switching;
  planName?: string | null;
  onDone: () => void;
  onCreate: () => void;
  manageHref: string;
  tone: "sidebar" | "page";
}) {
  const rowHover =
    tone === "sidebar"
      ? "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      : "hover:bg-bg-subtle";
  const muted = tone === "sidebar" ? "text-sidebar-muted" : "text-text-muted";
  const text = tone === "sidebar" ? "text-sidebar-text" : "text-text";
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {sw.groups.map((group, gi) => (
          <div key={group.key} role="group" aria-label={group.title}>
            {gi > 0 ? (
              <div className={cn("my-1 border-t", tone === "sidebar" ? "border-sidebar-menu-border" : "border-border")} />
            ) : null}
            <p className={cn("flex items-center justify-between px-3 py-1.5 text-xs font-medium", muted)}>
              <span className="truncate">{group.title}</span>
              {group.key === "personal" && planName ? (
                <span className="text-xs font-medium text-accent">
                  {planName}
                </span>
              ) : null}
            </p>
            {group.items.map((ws) => {
              const isActive = sw.isActiveItem(ws);
              const busy = sw.busyId === (ws.id ?? "main");
              return (
                <button
                  key={ws.id ?? "main"}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  disabled={!!sw.busyId}
                  aria-busy={busy || undefined}
                  onClick={() => sw.select(ws, onDone)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-[opacity,background-color] duration-150 disabled:opacity-50 touch:min-h-11",
                    text,
                    rowHover,
                    (isActive || busy) && "font-medium",
                  )}
                >
                  <WorkspaceIcon id={ws.icon} className={cn("h-4 w-4 shrink-0", muted)} />
                  <span className="min-w-0 flex-1 truncate capitalize">
                    {busy ? "Opening…" : ws.name}
                  </span>
                  {isActive ? <Check className="h-4 w-4 shrink-0 text-accent" /> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className={cn("flex shrink-0 border-t py-1", tone === "sidebar" ? "border-sidebar-menu-border" : "border-border")}>
        <button
          type="button"
          onClick={onCreate}
          className={cn("flex flex-1 items-center gap-2 px-3 py-2 text-sm touch:min-h-11", text, rowHover)}
        >
          <Plus className={cn("h-4 w-4", muted)} />
          New workspace
        </button>
        <Link
          href={manageHref}
          onClick={onDone}
          className={cn("flex items-center gap-2 px-3 py-2 text-sm touch:min-h-11", text, rowHover)}
        >
          <GearSix className={cn("h-4 w-4", muted)} />
          Manage
        </Link>
      </div>
    </>
  );
}

type WorkspaceSwitcherProps = {
  enabled: boolean;
  /** Plan name for the badge ("Growth"). */
  planName?: string | null;
  /**
   * sidebar: dropdown under the trigger (desktop sidebar header).
   * sheet: compact trigger that opens a bottom sheet (mobile top bar).
   */
  variant?: "sidebar" | "sheet";
  className?: string;
};

/**
 * Workspace switcher: Personal (Main + solo workspaces) and one group per
 * team, plus "New workspace" and "Manage".
 */
export function WorkspaceSwitcher({
  enabled,
  planName,
  variant = "sidebar",
  className,
}: WorkspaceSwitcherProps) {
  const sw = useWorkspaceSwitching(enabled);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { openLimit, limitModal } = useLimitModal();
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, maxHeight: 480 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Close if the route changes underneath (client-side nav).
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open || variant !== "sidebar") return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 288;
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        maxHeight: Math.max(160, window.innerHeight - rect.bottom - 12),
      });
    };
    update();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", update);
    };
  }, [open, variant]);

  if (!enabled) return null;
  if (sw.isLoading) {
    return (
      <SkeletonBone
        className={cn("h-9 w-full rounded-lg bg-sidebar-active", className)}
        aria-label="Loading workspace"
      />
    );
  }

  const done = () => setOpen(false);
  const startCreate = () => {
    setOpen(false);
    const { canCreate, canCreateTeam, ownedTeams } = sw.createDialogProps;
    // Nothing this plan can create: the plan-limit moment, not an empty form.
    if (!canCreate && !canCreateTeam && ownedTeams.length === 0) {
      openLimit("workspaces");
      return;
    }
    setCreateOpen(true);
  };
  const activeIcon = sw.active.icon ?? (sw.active.id === null ? "house" : "briefcase");

  const createDialog = (
    <CreateWorkspaceDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      {...sw.createDialogProps}
      onCreated={async () => {
        setCreateOpen(false);
        await sw.invalidateAll();
      }}
    />
  );
  const dialogs = (
    <>
      {createDialog}
      {limitModal}
    </>
  );

  if (variant === "sheet") {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-11 max-w-[60vw] items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold text-text active:bg-bg-muted"
        >
          <WorkspaceIcon id={activeIcon} className="h-4 w-4 shrink-0 text-text-muted" />
          <span className="truncate capitalize">{sw.active.name}</span>
          <CaretUpDown className="h-4 w-4 shrink-0 text-text-muted" />
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="gap-2 p-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-0">
            <DialogHeader className="px-5 pt-4 text-left">
              <DialogTitle>Switch workspace</DialogTitle>
              <DialogDescription className="sr-only">
                Pick the workspace to work in.
              </DialogDescription>
            </DialogHeader>
            <div role="listbox" aria-label="Workspaces" className="flex max-h-[60vh] flex-col">
              <WorkspaceMenuList
                sw={sw}
                planName={planName}
                onDone={done}
                onCreate={startCreate}
                manageHref="/dashboard/settings/workspaces"
                tone="page"
              />
            </div>
          </DialogContent>
        </Dialog>
        {dialogs}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold text-sidebar-text transition-[background-color] duration-150 hover:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          open && "bg-sidebar-active",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Workspace: ${sw.active.name}. Switch workspace`}
      >
        <WorkspaceIcon id={activeIcon} className="h-4 w-4 shrink-0 text-sidebar-muted" />
        <span className="min-w-0 flex-1 truncate capitalize">{sw.active.name}</span>
        <CaretUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={menuRef}
            role="listbox"
            aria-label="Workspaces"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: "translateY(-6px) scale(0.97)" }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: "translateY(-4px) scale(0.98)" }}
            transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: EASE_OUT }}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              maxHeight: menuPos.maxHeight,
              transformOrigin: "top left",
            }}
            className="fixed z-50 flex w-72 flex-col overflow-hidden rounded-2xl border border-sidebar-menu-border bg-sidebar-menu-bg shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.75)]"
          >
            <WorkspaceMenuList
              sw={sw}
              planName={planName}
              onDone={done}
              onCreate={startCreate}
              manageHref="/dashboard/settings/workspaces"
              tone="sidebar"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      {dialogs}
    </div>
  );
}

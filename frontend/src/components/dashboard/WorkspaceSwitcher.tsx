import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconChevronDown,
  IconHome,
  IconLoader2,
  IconPlus,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import {
  listWorkspaces,
  switchWorkspace,
  type WorkspaceListItem,
} from "@/api/team";

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

export function WorkspaceSwitcher({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | "main" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
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

  const teams = data?.teams ?? [];
  const canCreateTeam = !!data?.canCreateTeam;

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["team"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
    ]);
  };

  const handleSwitch = async (workspaceId: string | null) => {
    const key = workspaceId ?? "main";
    if (
      (workspaceId === null && active.id === null) ||
      workspaceId === active.id
    ) {
      setOpen(false);
      return;
    }
    setBusyId(key);
    try {
      await switchWorkspace(workspaceId);
      await invalidateAll();
      setOpen(false);
      toast.success(
        workspaceId === null ? "Switched to Main" : "Workspace switched",
      );
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to switch workspace",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!enabled) return null;

  const activeLabel =
    active.kind === "personal"
      ? active.name
      : active.teamName
        ? `${active.teamName} / ${active.name}`
        : active.name;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-bg px-3 py-2 text-left text-sm font-medium text-sidebar-text transition-colors hover:bg-sidebar-active"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {active.kind === "personal" ? (
          <IconHome
            className="h-4 w-4 shrink-0 text-sidebar-muted"
            strokeWidth={1.5}
          />
        ) : (
          <IconUsers
            className="h-4 w-4 shrink-0 text-sidebar-muted"
            strokeWidth={1.5}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{activeLabel}</span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-sidebar-muted transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-border bg-bg-elevated py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Workspace
          </p>

          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-text-muted">
              <IconLoader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              Loading…
            </div>
          ) : (
            <>
              <WorkspaceOption
                label="Main"
                subtitle="Personal"
                active={active.id === null}
                busy={busyId === "main"}
                personal
                onSelect={() => void handleSwitch(null)}
              />

              {teams.map((team) => (
                <div key={team.id}>
                  <div className="my-1 border-t border-border" />
                  <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                    {team.name}
                    <span className="ml-1 font-normal normal-case tracking-normal">
                      ({team.kind === "owned" ? "yours" : "joined"})
                    </span>
                  </p>
                  {team.workspaces.map((ws) => (
                    <WorkspaceOption
                      key={ws.id}
                      label={ws.name}
                      subtitle={`${ws.connectionCount} connected`}
                      active={ws.isActive}
                      busy={busyId === ws.id}
                      onSelect={() => void handleSwitch(ws.id)}
                    />
                  ))}
                </div>
              ))}

              <div className="my-1 border-t border-border" />
              <Link
                href="/dashboard/workspaces"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-sidebar-active"
              >
                <IconSettings
                  className="h-4 w-4 text-text-muted"
                  strokeWidth={1.5}
                />
                Manage workspaces
              </Link>
              <Link
                href="/dashboard/teams"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-sidebar-active"
              >
                <IconUsers
                  className="h-4 w-4 text-text-muted"
                  strokeWidth={1.5}
                />
                Manage teams
              </Link>
              {canCreateTeam ? (
                <Link
                  href="/dashboard/teams/create"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-sidebar-active"
                >
                  <IconPlus
                    className="h-4 w-4 text-text-muted"
                    strokeWidth={1.5}
                  />
                  New team
                </Link>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceOption({
  label,
  subtitle,
  active,
  busy,
  personal,
  onSelect,
}: {
  label: string;
  subtitle: string;
  active: boolean;
  busy: boolean;
  personal?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-active disabled:opacity-60 ${
        active
          ? "bg-sidebar-active font-medium text-sidebar-text"
          : "text-text"
      }`}
    >
      {personal ? (
        <IconHome
          className="h-4 w-4 shrink-0 text-text-muted"
          strokeWidth={1.5}
        />
      ) : (
        <IconUsers
          className="h-4 w-4 shrink-0 text-text-muted"
          strokeWidth={1.5}
        />
      )}
      <span className="min-w-0 flex-1 truncate">
        {label}
        <span className="mt-0.5 block truncate text-xs font-normal text-text-muted">
          {subtitle}
        </span>
      </span>
      {busy ? (
        <IconLoader2
          className="h-4 w-4 animate-spin text-text-muted"
          strokeWidth={1.5}
        />
      ) : null}
    </button>
  );
}

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconChevronDown,
  IconHome,
  IconLoader2,
  IconPlus,
  IconSettings,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import {
  createWorkspace,
  listWorkspaces,
  switchWorkspace,
  type WorkspaceListItem,
} from "@/api/team";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

export function WorkspaceSwitcher({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("New Workspace");
  const [creating, setCreating] = useState(false);
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
      role: null,
      isOwner: true,
      isActive: true,
      connectionCount: 0,
    } satisfies WorkspaceListItem);

  const owned = data?.workspaces.filter((w) => w.kind === "owned") ?? [];
  const joined = data?.workspaces.filter((w) => w.kind === "joined") ?? [];
  const canCreate = !!data?.canCreate;

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

  const openCreateDialog = () => {
    setOpen(false);
    setNewName("New Workspace");
    setCreateOpen(true);
  };

  const handleCreateOpenChange = (next: boolean) => {
    if (!next && creating) return;
    setCreateOpen(next);
    if (!next) setNewName("New Workspace");
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Enter a workspace name");
      return;
    }
    setCreating(true);
    try {
      await createWorkspace(name);
      await invalidateAll();
      setCreateOpen(false);
      toast.success("Workspace created");
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create workspace",
      );
    } finally {
      setCreating(false);
    }
  };

  if (!enabled) return null;

  return (
    <>
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
          ) : active.kind === "joined" ? (
            <IconUsers
              className="h-4 w-4 shrink-0 text-sidebar-muted"
              strokeWidth={1.5}
            />
          ) : (
            <IconUser
              className="h-4 w-4 shrink-0 text-sidebar-muted"
              strokeWidth={1.5}
            />
          )}
          <span className="min-w-0 flex-1 truncate">{active.name}</span>
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
                  item={
                    data?.workspaces.find((w) => w.kind === "personal") ?? {
                      id: null,
                      name: "Main",
                      kind: "personal",
                      role: null,
                      isOwner: true,
                      isActive: active.id === null,
                      connectionCount: 0,
                    }
                  }
                  busy={busyId === "main"}
                  onSelect={() => void handleSwitch(null)}
                />

                {owned.length > 0 ? (
                  <>
                    <div className="my-1 border-t border-border" />
                    <p className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                      <IconUser className="h-3 w-3" strokeWidth={1.5} />
                      Yours
                    </p>
                    {owned.map((item) => (
                      <WorkspaceOption
                        key={item.id}
                        item={item}
                        busy={busyId === item.id}
                        onSelect={() => void handleSwitch(item.id)}
                      />
                    ))}
                  </>
                ) : null}

                {joined.length > 0 ? (
                  <>
                    <div className="my-1 border-t border-border" />
                    <p className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                      <IconUsers className="h-3 w-3" strokeWidth={1.5} />
                      Teams
                    </p>
                    {joined.map((item) => (
                      <WorkspaceOption
                        key={item.id}
                        item={item}
                        busy={busyId === item.id}
                        onSelect={() => void handleSwitch(item.id)}
                      />
                    ))}
                  </>
                ) : null}

                <div className="my-1 border-t border-border" />
                <Link
                  href="/dashboard/teams"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-sidebar-active"
                >
                  <IconSettings
                    className="h-4 w-4 text-text-muted"
                    strokeWidth={1.5}
                  />
                  Manage workspaces
                </Link>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={openCreateDialog}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-sidebar-active"
                  >
                    <IconPlus
                      className="h-4 w-4 text-text-muted"
                      strokeWidth={1.5}
                    />
                    New workspace
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Connections are per workspace. Each existing workspace needs at
              least one connected account before you can create another.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Client work, Personal brand"
              maxLength={80}
              autoFocus
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={() => handleCreateOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creating || !newName.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? (
                <IconLoader2
                  className="h-4 w-4 animate-spin"
                  strokeWidth={1.5}
                />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WorkspaceOption({
  item,
  busy,
  onSelect,
}: {
  item: WorkspaceListItem;
  busy: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-active disabled:opacity-60 ${
        item.isActive
          ? "bg-sidebar-active font-medium text-sidebar-text"
          : "text-text"
      }`}
    >
      {item.kind === "personal" ? (
        <IconHome
          className="h-4 w-4 shrink-0 text-text-muted"
          strokeWidth={1.5}
        />
      ) : item.kind === "joined" ? (
        <IconUsers
          className="h-4 w-4 shrink-0 text-text-muted"
          strokeWidth={1.5}
        />
      ) : (
        <IconUser
          className="h-4 w-4 shrink-0 text-text-muted"
          strokeWidth={1.5}
        />
      )}
      <span className="min-w-0 flex-1 truncate">
        {item.name}
        {item.kind !== "personal" ? (
          <span className="mt-0.5 block truncate text-xs font-normal text-text-muted">
            {item.connectionCount} connected
          </span>
        ) : null}
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

import { useEffect, useState } from "react";
import {
  IconBriefcase,
  IconHome,
  IconLoader2,
  IconPlus,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { createTeam, createWorkspaceInTeam } from "@/api/team";
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
import { cn } from "@/lib/utils";

const WORKSPACE_ICONS = [
  { id: "briefcase", Icon: IconBriefcase },
  { id: "home", Icon: IconHome },
  { id: "users", Icon: IconUsers },
] as const;

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  ownedTeams,
  canCreate,
  canCreateTeam,
  ownedTeamCount,
  maxOwnedTeams,
  prefillTeamId = null,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownedTeams: { id: string; name: string }[];
  canCreate: boolean;
  canCreateTeam: boolean;
  ownedTeamCount: number;
  maxOwnedTeams: number;
  prefillTeamId?: string | null;
  onCreated: () => Promise<void>;
}) {
  const [teamMode, setTeamMode] = useState(false);
  const [teamChoice, setTeamChoice] = useState<"existing" | "new">("new");
  const [existingTeamId, setExistingTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [iconId, setIconId] = useState<(typeof WORKSPACE_ICONS)[number]["id"]>(
    "briefcase",
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const hasTeams = ownedTeams.length > 0;
    const preferExisting = !!prefillTeamId || (!canCreateTeam && hasTeams);
    setTeamMode(preferExisting || !!prefillTeamId);
    setTeamChoice(preferExisting ? "existing" : "new");
    setExistingTeamId(
      prefillTeamId && ownedTeams.some((t) => t.id === prefillTeamId)
        ? prefillTeamId
        : (ownedTeams[0]?.id ?? ""),
    );
    setTeamName("");
    setWorkspaceName("");
    setIconId("briefcase");
    setSubmitting(false);
  }, [open, prefillTeamId, ownedTeams, canCreateTeam]);

  const canSubmit = (() => {
    if (!workspaceName.trim()) return false;
    if (!teamMode) return canCreate;
    if (teamChoice === "existing") return !!existingTeamId;
    return canCreateTeam && !!teamName.trim();
  })();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (!teamMode) {
        await createTeam(workspaceName.trim(), workspaceName.trim(), {
          isCollaborative: false,
        });
      } else if (teamChoice === "existing") {
        await createWorkspaceInTeam(existingTeamId, workspaceName.trim());
      } else {
        await createTeam(teamName.trim(), workspaceName.trim());
      }
      toast.success("Workspace created");
      await onCreated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create workspace",
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Workspace</DialogTitle>
          <DialogDescription className="sr-only">
            Create a workspace, optionally as part of a shared team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={teamMode}
              disabled={submitting}
              onClick={() => {
                const next = !teamMode;
                setTeamMode(next);
                if (next) {
                  if (ownedTeams.length > 0 && !canCreateTeam) {
                    setTeamChoice("existing");
                  } else if (ownedTeams.length === 0) {
                    setTeamChoice("new");
                  }
                  if (!workspaceName.trim()) setWorkspaceName("Main Team");
                }
              }}
              className={cn(
                "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
                teamMode ? "bg-emerald-500" : "bg-border",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  teamMode && "translate-x-5",
                )}
              />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">Team workspace</p>
              <p className="mt-0.5 text-sm text-text-muted">
                Create a team with shared workspace.
              </p>
              {teamMode ? (
                <p className="mt-1.5 text-xs font-medium text-text-muted">
                  {ownedTeamCount} / {maxOwnedTeams} teams created
                </p>
              ) : null}
            </div>
          </div>

          {teamMode ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text">Team</p>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="team-choice"
                  className="mt-1"
                  checked={teamChoice === "existing"}
                  disabled={submitting || ownedTeams.length === 0}
                  onChange={() => setTeamChoice("existing")}
                />
                <span className="text-sm text-text">Select existing team</span>
              </label>
              {teamChoice === "existing" ? (
                ownedTeams.length > 0 ? (
                  <select
                    value={existingTeamId}
                    onChange={(e) => setExistingTeamId(e.target.value)}
                    disabled={submitting}
                    className="ml-6 w-[calc(100%-1.5rem)] rounded-md border border-input bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {ownedTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="ml-6 text-sm text-text-muted">
                    You don&apos;t own any teams yet.
                  </p>
                )
              ) : null}

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="team-choice"
                  className="mt-1"
                  checked={teamChoice === "new"}
                  disabled={submitting || !canCreateTeam}
                  onChange={() => setTeamChoice("new")}
                />
                <span className="text-sm text-text">Create new team</span>
              </label>
              {teamChoice === "new" ? (
                <Input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Marketing Team"
                  maxLength={80}
                  disabled={submitting || !canCreateTeam}
                  className="ml-6 w-[calc(100%-1.5rem)]"
                />
              ) : null}
              {!canCreateTeam && teamChoice === "new" ? (
                <p className="ml-6 text-xs text-text-muted">
                  {ownedTeamCount >= maxOwnedTeams
                    ? `You already have ${maxOwnedTeams} teams. Select an existing team instead.`
                    : "Creating teams requires Pro."}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="create-workspace-name">
              {teamMode ? "Main Workspace Name" : "Workspace Name"}
            </Label>
            <Input
              id="create-workspace-name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder={
                teamMode ? "e.g., Main Team" : "e.g., Personal, Work, Clients"
              }
              maxLength={80}
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex gap-2">
              {WORKSPACE_ICONS.map(({ id, Icon }) => (
                <button
                  key={id}
                  type="button"
                  disabled={submitting}
                  onClick={() => setIconId(id)}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg border transition-colors",
                    iconId === id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-bg text-text-muted hover:bg-bg-muted",
                  )}
                  aria-label={`Icon ${id}`}
                  aria-pressed={iconId === id}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={submitting || !canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <IconLoader2
                className="h-4 w-4 animate-spin"
                strokeWidth={1.5}
              />
            ) : (
              <IconPlus className="h-4 w-4" strokeWidth={1.5} />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

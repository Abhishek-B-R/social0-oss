import { useEffect, useState } from "react";
import { IconLoader2, IconPlus } from "@tabler/icons-react";
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
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription className="sr-only">
            Create a workspace, optionally as part of a shared team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">Shared with a team</p>
              <p className="mt-0.5 text-sm text-text-muted">
                Invite people later from team settings.
              </p>
              {teamMode ? (
                <p className="mt-1.5 text-xs text-text-muted">
                  {ownedTeamCount} / {maxOwnedTeams} teams created
                </p>
              ) : null}
            </div>
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
                }
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60 ${
                teamMode
                  ? "border-accent bg-accent"
                  : "border-gray-400 bg-bg-muted dark:border-gray-600"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full border border-gray-400 bg-gray-600 shadow ring-0 transition-transform dark:border-gray-600 dark:bg-gray-300 ${
                  teamMode ? "translate-x-5" : "translate-x-0.5"
                }`}
                style={{ marginTop: "0.5px" }}
              />
            </button>
          </div>

          {teamMode ? (
            <div className="space-y-3 rounded-xl border border-accent/35 bg-accent/[0.06] p-3.5">
              <p className="text-sm font-medium text-text">Team</p>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="team-choice"
                  className="mt-1 accent-accent"
                  checked={teamChoice === "new"}
                  disabled={submitting || !canCreateTeam}
                  onChange={() => setTeamChoice("new")}
                />
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="block text-sm text-text">New team</span>
                  {teamChoice === "new" ? (
                    <Input
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="e.g. Marketing"
                      maxLength={80}
                      disabled={submitting || !canCreateTeam}
                    />
                  ) : null}
                  {!canCreateTeam && teamChoice === "new" ? (
                    <p className="text-xs text-text-muted">
                      {ownedTeamCount >= maxOwnedTeams
                        ? `You already have ${maxOwnedTeams} teams. Pick an existing one.`
                        : "Creating teams requires Pro."}
                    </p>
                  ) : null}
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="team-choice"
                  className="mt-1 accent-accent"
                  checked={teamChoice === "existing"}
                  disabled={submitting || ownedTeams.length === 0}
                  onChange={() => setTeamChoice("existing")}
                />
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="block text-sm text-text">Existing team</span>
                  {teamChoice === "existing" ? (
                    ownedTeams.length > 0 ? (
                      <select
                        value={existingTeamId}
                        onChange={(e) => setExistingTeamId(e.target.value)}
                        disabled={submitting}
                        className="h-9 w-full rounded-xl border border-input bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                      >
                        {ownedTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-text-muted">
                        You don&apos;t own any teams yet.
                      </p>
                    )
                  ) : null}
                </span>
              </label>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="create-workspace-name">
              {teamMode ? "Default workspace name" : "Name"}
            </Label>
            <Input
              id="create-workspace-name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder={
                teamMode ? "e.g. Main" : "e.g. Personal, Work, Clients"
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

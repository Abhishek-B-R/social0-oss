import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { inviteTeamMember } from "@/api/team";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  WORKSPACE_ROLES,
  WORKSPACE_ROLE_META,
  type WorkspaceRole,
} from "@/lib/workspace-roles";
import { cn } from "@/lib/utils";
import { FieldError } from "@/features/dashboard/settings/settings-ui";
import { ROLE_DESCRIPTIONS } from "./role-descriptions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const e = part.trim().replace(/^<|>$/g, "");
    if (!e) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** Invite one or more people by email with one role. Reuses `POST /api/team/invite`. */
export function InviteMembersDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
  seatsLeft,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  teamName: string;
  /** Teammate seats left (members + pending invites count). */
  seatsLeft: number;
  onInvited: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emails = parseEmails(raw);
  const invalid = emails.filter((e) => !EMAIL_RE.test(e));

  const reset = () => {
    setRaw("");
    setRole("member");
    setError(null);
  };

  const submit = async () => {
    if (busy) return;
    if (emails.length === 0) return setError("Enter at least one email address.");
    if (invalid.length > 0) {
      return setError(`${invalid.join(", ")} ${invalid.length === 1 ? "isn't" : "aren't"} a valid email.`);
    }
    if (emails.length > seatsLeft) {
      return setError(
        seatsLeft <= 0
          ? "This team is full. Remove someone or cancel an invite first."
          : `Only ${seatsLeft} more ${seatsLeft === 1 ? "seat is" : "seats are"} left. Invite fewer people.`,
      );
    }
    setError(null);
    setBusy(true);
    const failed: { email: string; reason: string }[] = [];
    let sent = 0;
    // One at a time: the server checks seats and duplicates per invite.
    for (const email of emails) {
      try {
        await inviteTeamMember({ email, role, teamId });
        sent += 1;
      } catch (err) {
        failed.push({ email, reason: err instanceof Error ? err.message : "Couldn't send." });
      }
    }
    setBusy(false);
    if (sent > 0) {
      onInvited();
      toast.success(
        sent === 1 ? `Invite sent to ${emails.find((e) => !failed.some((f) => f.email === e))}` : `${sent} invites sent`,
        { description: `They join ${teamName} as ${WORKSPACE_ROLE_META[role].label}.` },
      );
    }
    if (failed.length === 0) {
      reset();
      onOpenChange(false);
      return;
    }
    // Keep only the ones that failed so they can fix and retry.
    setRaw(failed.map((f) => f.email).join(", "));
    setError(failed.map((f) => `${f.email}: ${f.reason}`).join(" "));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite people to {teamName}</DialogTitle>
          <DialogDescription>
            We email each person. They accept from the banner at the top of their dashboard after signing in with
            that email.
          </DialogDescription>
        </DialogHeader>
        <form
          id="invite-members-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="invite-emails">Emails</Label>
            <textarea
              id="invite-emails"
              autoFocus
              rows={3}
              value={raw}
              disabled={busy}
              placeholder="priya@acme.com, sam@client.com"
              onChange={(e) => {
                setRaw(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              aria-describedby="invite-emails-hint"
              className="w-full resize-y rounded-lg border border-input bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <p id="invite-emails-hint" className="text-xs text-text-muted">
              Separate with commas or new lines. {seatsLeft > 0 ? `${seatsLeft} ${seatsLeft === 1 ? "seat" : "seats"} left.` : "No seats left."}
            </p>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium text-text">Role</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {WORKSPACE_ROLES.map((r) => (
                <label
                  key={r}
                  className={cn(
                    "flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                    role === r ? "border-accent bg-accent/5" : "border-border hover:bg-bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    disabled={busy}
                    className="mt-0.5 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text">{WORKSPACE_ROLE_META[r].label}</span>
                    <span className="block text-xs text-text-muted">{ROLE_DESCRIPTIONS[r]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <FieldError>{error}</FieldError>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form="invite-members-form" disabled={busy || emails.length === 0}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {busy
              ? "Sending…"
              : emails.length > 1
                ? `Send ${emails.length} invites`
                : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

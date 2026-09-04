import { useState } from "react";
import { toast } from "sonner";
import { deleteAccount } from "@/api/settings";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { resetVemetricUser } from "@/lib/vemetric";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function DeleteAccountSection({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const close = () => {
    if (loading) return;
    setOpen(false);
    setConfirmText("");
  };

  const handleDelete = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await deleteAccount(confirmText);
      if (!result.success) {
        toast.error(result.error);
        setLoading(false);
        return;
      }
      // Clear Better Auth cookies client-side (cookie cache can outlive DB delete).
      try {
        await resetVemetricUser();
        await authClient.signOut();
      } catch {
        /* account/session may already be gone */
      }
      toast.success("Your account has been deleted.");
      window.location.href = "/";
    } catch {
      toast.error(
        "Could not delete account. Please try again or email privacy@social0.app.",
      );
      setLoading(false);
    }
  };

  return (
    <div className={cn("mt-10", className)}>
      <h3 className="text-base font-semibold text-foreground">Delete account</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Permanently close your Social0 account. This cannot be undone.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center justify-center rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive transition-colors touch-manipulation hover:bg-destructive/10 touch:min-h-11"
      >
        Delete my account…
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
          else setOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md border-border bg-bg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-text">
              Delete account?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              This permanently closes your account. Type DELETE to confirm.
            </DialogDescription>
          </DialogHeader>

          <label className="block text-sm text-muted-foreground">
            Type <span className="font-semibold text-foreground">DELETE</span> to
            confirm
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              disabled={loading}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              placeholder="DELETE"
            />
          </label>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={close}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading || confirmText.trim() !== "DELETE"}
              onClick={() => void handleDelete()}
              className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Deleting…" : "Permanently delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

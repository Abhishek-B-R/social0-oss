import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirm before removing a connected account. The caller does the delete
 * (so it can update the list optimistically); this only collects the yes.
 */
export function DisconnectAccountDialog({
  open,
  onOpenChange,
  accountLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "@brand on Instagram" */
  accountLabel: string;
  /** Resolves when done; throw to keep the dialog open (the caller shows the error). */
  onConfirm: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Caller already surfaced the error; leave the dialog open for a retry.
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect this account?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-text">{accountLabel}</span> will be
            removed from Social0. Your post history stays. You can connect it again
            any time.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            {pending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

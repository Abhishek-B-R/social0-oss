import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { plural } from "./post-actions";

type DeletePostsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Statuses of the posts being deleted (drives the copy). */
  statuses: string[];
  onConfirm: () => Promise<void>;
};

/**
 * Confirm before deleting. Deleting can't be undone, and it never removes
 * a post that is already live on a network, so the copy says both.
 */
export function DeletePostsDialog({
  open,
  onOpenChange,
  statuses,
  onConfirm,
}: DeletePostsDialogProps) {
  const [pending, setPending] = useState(false);
  const n = statuses.length;
  const anyLive = statuses.some((s) => s === "published" || s === "partial");
  const anyScheduled = statuses.some((s) => s === "scheduled");
  const onlyDrafts = n > 0 && statuses.every((s) => s === "draft");

  const title =
    n === 1
      ? onlyDrafts
        ? "Delete this draft?"
        : anyScheduled
          ? "Delete this scheduled post?"
          : "Delete this post?"
      : `Delete ${plural(n)}?`;

  const lines: string[] = ["This can't be undone."];
  if (anyScheduled) lines.push(n === 1 ? "It won't be published." : "Scheduled posts won't be published.");
  if (anyLive)
    lines.push(
      n === 1
        ? "It stays live on the networks it was published to; this only removes it from Social0."
        : "Published posts stay live on their networks; this only removes them from Social0.",
    );

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{lines.join(" ")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void onConfirm().finally(() => {
                setPending(false);
                onOpenChange(false);
              });
            }}
          >
            {pending ? "Deleting…" : n > 1 ? `Delete ${plural(n)}` : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

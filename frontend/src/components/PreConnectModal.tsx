import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PreConnectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  title: string;
  checkmark: string;
  info: string;
};

/**
 * "Before you connect" note for networks with a prerequisite. Built on the
 * shared Dialog so it gets the same tokens (dark mode), focus trap, Escape,
 * scroll lock and phone bottom sheet as every other dialog.
 */
export function PreConnectModal({
  isOpen,
  onClose,
  onContinue,
  title,
  checkmark,
  info,
}: PreConnectModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="flex items-start gap-2.5 text-left font-medium text-text">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Check className="size-3" aria-hidden strokeWidth={3} />
            </span>
            {checkmark}
          </DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-line text-sm text-text-muted">{info}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onContinue}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

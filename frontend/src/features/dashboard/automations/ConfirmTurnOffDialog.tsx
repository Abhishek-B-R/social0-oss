import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TurnOffRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<unknown>;
};

/**
 * Confirms turning off something that can't be turned back on from the
 * Automations page (a watching Auto-Plug is deleted; a scheduled post's
 * settings are removed from it).
 */
export function ConfirmTurnOffDialog({
  request,
  onClose,
}: {
  request: TurnOffRequest | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep it on
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const r = request;
              onClose();
              void r?.onConfirm();
            }}
          >
            {request?.confirmLabel ?? "Turn off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

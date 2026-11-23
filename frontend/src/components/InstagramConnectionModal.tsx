import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type InstagramConnectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectDirect: () => void;
  onSelectFacebookPage: () => void;
};

const optionClass =
  "group flex w-full items-start gap-3 rounded-xl border border-border bg-bg-elevated p-4 text-left transition-colors hover:border-accent/60 hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

export function InstagramConnectionModal({
  isOpen,
  onClose,
  onSelectDirect,
  onSelectFacebookPage,
}: InstagramConnectionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Instagram</DialogTitle>
          <DialogDescription>Choose how to connect your Instagram account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <button type="button" onClick={onSelectDirect} className={optionClass}>
            <span className="min-w-0 flex-1">
              <span className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text">Connect via Instagram</span>
                <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
                  Recommended
                </span>
              </span>
              <span className="block text-sm text-text-muted">
                Connect directly with your Instagram Business or Creator account.
                Requires your Instagram account to be linked to a Facebook Page.
              </span>
            </span>
            <ChevronRight
              className="mt-0.5 size-4 shrink-0 text-text-muted group-hover:text-accent"
              aria-hidden
            />
          </button>
          <button type="button" onClick={onSelectFacebookPage} className={optionClass}>
            <span className="min-w-0 flex-1">
              <span className="mb-1 block font-semibold text-text">
                Connect via Facebook Page
              </span>
              <span className="block text-sm text-text-muted">
                Connect through your Facebook Page. If you have multiple Pages with
                Instagram accounts, you can choose which one to connect.
              </span>
            </span>
            <ChevronRight
              className="mt-0.5 size-4 shrink-0 text-text-muted group-hover:text-accent"
              aria-hidden
            />
          </button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


import { useLocation } from "react-router-dom";
import { useState } from "react";
import Link from "@/components/AppLink";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { signInUrl } from "@/lib/sign-in-url";

const DISMISS_KEY = "social0-guest-dashboard-dialog-dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function GuestTestModeDialog() {
  const pathname = useLocation().pathname;
  const signInHref = signInUrl(pathname);
  const [open, setOpen] = useState(() => !readDismissed());

  const handleExplore = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore quota / private mode
    }
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleExplore();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Dashboard test mode</DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed text-muted-foreground pt-1">
            You&apos;re visiting the dashboard in test mode, so you can&apos;t
            post anything. You can explore its structure and see how things are
            laid out. If you want to post real content, sign in first.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            asChild
            className="w-full bg-accent hover:bg-accent-hover text-accent-foreground"
          >
            <Link href={signInHref}>Complete sign in</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full border-border hover:bg-muted hover:text-foreground"
            onClick={handleExplore}
          >
            Explore dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

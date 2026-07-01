
import { useState } from "react";
import { IconChevronUp } from "@tabler/icons-react";
import { SignOutButton } from "@/components/SignOutButton";
import { cn } from "@/lib/utils";

type MorePageAccountCollapsibleProps = {
  image: string | null | undefined;
  name: string | null | undefined;
  email: string | null | undefined;
  planLabel: string;
};

export function MorePageAccountCollapsible({
  image,
  name,
  email,
  planLabel,
}: MorePageAccountCollapsibleProps) {
  const [open, setOpen] = useState(false);
  const displayName = name || email || "User";

  return (
    <section className="mb-6 mt-6 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-bg-subtle active:bg-bg-muted touch-manipulation -mx-1"
        aria-expanded={open}
        aria-controls="more-account-signout"
        id="more-account-trigger"
      >
        {image ? (
          <img
            src={image}
            alt={displayName}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
            {(name || email || "U").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          <p className="truncate text-xs text-text-muted">{planLabel}</p>
        </div>
        <IconChevronUp
          className={cn(
            "h-4 w-4 shrink-0 text-foreground transition-transform duration-200",
            open ? "rotate-0" : "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div id="more-account-signout" className="pt-0.5">
          <SignOutButton className="rounded-full border-0 bg-bg-muted py-3 text-sm font-medium text-foreground shadow-none hover:bg-bg-subtle" />
        </div>
      )}
    </section>
  );
}

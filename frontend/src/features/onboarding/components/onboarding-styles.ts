import { cn } from "@/lib/utils";

/* Buttons. Tokens only: accent is the brand emerald in both themes. */

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const onboardingPrimaryCtaClass = cn(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 py-2.5 text-[15px] font-semibold text-accent-foreground shadow-sm transition-[transform,background-color] duration-150 ease-out hover:bg-accent-hover active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100",
  focusRing,
);

/** The one quiet "skip" link a step may have. */
export const onboardingGhostLinkClass = cn(
  "rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-60",
  focusRing,
);

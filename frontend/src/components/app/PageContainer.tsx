import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one content column every dashboard page sits in.
 *
 * Width and side padding come from `DashboardLayout` (max 1200px, left edge
 * shared by every page), so this adds none of its own: no `max-w-*`, no
 * `mx-auto`. A page that wraps itself in a narrower centered column drifts
 * away from the others' left edge, which is exactly what this replaces.
 *
 * `stack` spaces direct children 24px apart (PageHeader's own bottom margin
 * collapses into it), so sections line up the same on every page.
 */
export function PageContainer({
  children,
  stack = false,
  className,
}: {
  children: ReactNode;
  /** 24px between direct children. */
  stack?: boolean;
  className?: string;
}) {
  return (
    <div data-page-container className={cn("w-full min-w-0", stack && "space-y-6", className)}>
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const WIDTH = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-3xl",
} as const;

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons rendered next to the close button in the header. */
  headerActions?: ReactNode;
  /** Sticky footer (primary actions). */
  footer?: ReactNode;
  width?: keyof typeof WIDTH;
  children: ReactNode;
  className?: string;
  /** Keep focus where it was when opening (e.g. drawers opened by row hover). */
  preventAutoFocus?: boolean;
};

/**
 * Right-side sheet on Radix Dialog (focus trap, Esc, scroll lock). Full
 * width on phones. Used for day drawer, account settings, webhook detail.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  footer,
  width = "md",
  children,
  className,
  preventAutoFocus,
}: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="drawer-overlay"
          className="fixed inset-0 z-50 bg-scrim"
        />
        <DialogPrimitive.Content
          data-slot="drawer-content"
          onOpenAutoFocus={preventAutoFocus ? (e) => e.preventDefault() : undefined}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-bg-elevated text-text shadow-2xl outline-none",
            "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
            WIDTH[width],
            className,
          )}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-base font-semibold tracking-tight text-text">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            {headerActions ? (
              <div className="flex shrink-0 items-center gap-1.5">{headerActions}</div>
            ) : null}
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:size-11"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

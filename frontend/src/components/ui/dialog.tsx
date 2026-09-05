
import * as React from "react"
import { XIcon } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // Enter/exit motion lives in index.css, keyed off Radix's
          // data-state: the animate-in / zoom-in-95 utilities this file used
          // to carry were never emitted by this build, so dialogs had no
          // animation at all.
          "bg-bg-elevated text-text fixed z-50 flex flex-col gap-4 border border-border shadow-lg outline-none",
          // ---- Mobile: bottom sheet ----
          // A centred modal is the wrong pattern on a phone: it is far from
          // the thumb, it has nowhere to grow, and the keyboard shoves it
          // off-screen. So anchor to the bottom edge, sit above the keyboard
          // via --kb-inset, and bound the height by the *visible* viewport
          // (--vv-height) so a tall sheet scrolls internally instead of
          // running off the top once the keyboard is up. 88dvh is the
          // pre-JS fallback.
          "inset-x-0 mx-auto bottom-[var(--kb-inset,0px)] max-h-[calc(var(--vv-height,88dvh)-2.5rem)] overflow-y-auto rounded-t-2xl border-b-0 p-5 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))]",
          // ---- sm and up: the original centred dialog ----
          "sm:inset-x-auto sm:bottom-auto sm:top-[50%] sm:left-[50%] sm:max-h-[calc(100dvh-4rem)] sm:w-full sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:border-b sm:p-6 sm:pb-6",
          className
        )}
        {...props}
      >
        {/* Sheet grab handle — signals "this panel came up from the bottom
            and can be dismissed". Purely decorative; dismissal is the
            overlay tap, the close button, or Escape. */}
        <div
          aria-hidden
          className="mx-auto -mt-1 mb-1 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden"
        />
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Close"
            className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-lg text-text-muted opacity-70 transition-opacity touch-manipulation hover:bg-muted hover:text-text hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:pointer-events-none touch:size-11 sm:top-4 sm:right-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold text-text", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-text-muted text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

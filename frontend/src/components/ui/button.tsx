import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // `touch-manipulation` removes the ~300ms tap delay mobile browsers add
  // while they wait to see if a tap is a double-tap-to-zoom.
  "touch-manipulation inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[transform,colors,background-color,border-color,opacity] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground hover:bg-accent-hover shadow-sm",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border border-border bg-bg-elevated shadow-sm hover:bg-muted hover:text-foreground",
        secondary:
          "bg-bg-muted text-text hover:bg-bg-subtle",
        ghost:
          "hover:bg-muted hover:text-foreground",
        link: "text-accent underline-offset-4 hover:underline",
      },
      // Desktop heights are unchanged. The `touch:` variant grows each size
      // to a thumb-reachable target on coarse pointers (WCAG 2.5.5 / Apple
      // HIG / Material all converge on ~44px), so mobile stops needing
      // per-call-site `min-h-[44px] sm:min-h-0` patches.
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 touch:h-11",
        xs: "h-6 gap-1 rounded-lg px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3 touch:h-8",
        sm: "h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5 touch:h-10",
        lg: "h-10 rounded-xl px-6 has-[>svg]:px-4 touch:h-12",
        icon: "size-9 touch:size-11",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3 touch:size-8",
        "icon-sm": "size-8 touch:size-10",
        "icon-lg": "size-10 touch:size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      {...props}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      {...(asChild ? {} : { type: props.type ?? "button" })}
      className={cn(buttonVariants({ variant, size, className }))}
    />
  )
}

export { Button, buttonVariants }

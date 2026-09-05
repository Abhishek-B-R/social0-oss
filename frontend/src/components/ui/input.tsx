import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-xl border border-input bg-bg px-4 py-2.5 text-sm text-text shadow-none transition-[color,box-shadow] outline-none",
        // Thumb-sized on touch devices only; desktop keeps its 40px density.
        // Font size is floored at 16px for coarse pointers in index.css so
        // iOS does not zoom the viewport on focus.
        "touch:min-h-11",
        "placeholder:text-text-muted file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }

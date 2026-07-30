import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Pulsing placeholder bar/block used inside page skeletons. */
export function SkeletonBone({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

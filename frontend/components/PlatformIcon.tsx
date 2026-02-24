"use client";

import { getPlatformIcon } from "@/lib/platform-icons";
import { cn } from "@/lib/utils";

type PlatformIconProps = {
  platform: string;
  size?: number;
  className?: string;
};

/**
 * Renders the Simple Icons (Si) icon for the given platform.
 * Used in account selector bubbles, post cards, connections page, bulk tools.
 */
export function PlatformIcon({
  platform,
  size = 16,
  className = "",
}: PlatformIconProps) {
  const Icon = getPlatformIcon(platform);
  if (!Icon) {
    return (
      <span
        className={cn("shrink-0 rounded-full bg-gray-300", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <Icon
      className={cn("shrink-0", className)}
      size={size}
      style={{ width: size, height: size }}
    />
  );
}

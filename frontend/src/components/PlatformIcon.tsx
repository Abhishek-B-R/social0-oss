
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
        className={cn("shrink-0 rounded-full bg-bg-muted", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line react-hooks/static-components
    <Icon
      className={cn("shrink-0", className)}
      size={size}
      style={{ width: size, height: size }}
    />
  );
}

/** Corner mark on account PFPs, same as composer AccountBubbleSelector. */
export function AccountPlatformMark({
  platform,
  compact = false,
  className,
}: {
  platform: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 border-card bg-card",
        compact ? "h-4 w-4" : "h-[18px] w-[18px]",
        className,
      )}
      aria-hidden
    >
      <span
        className={cn(
          "flex items-center justify-center [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full [&_svg]:shrink-0",
          compact ? "h-2.5 w-2.5" : "h-3 w-3",
        )}
      >
        <PlatformIcon platform={platform} size={compact ? 10 : 12} />
      </span>
    </span>
  );
}

import { PlatformIcon } from "@/components/PlatformIcon";
import { cn } from "@/lib/utils";
import { networkLabel } from "./network";
import { deliveryTone, type DeliveryTone } from "./status";

type NetworkIconProps = {
  /** Platform id: linkedin, facebook, bluesky, youtube, pinterest, instagram, tiktok, twitter_x, threads. */
  network: string;
  size?: number;
  className?: string;
  /** Accessible name. Defaults to the network label; pass `""` when decorative. */
  label?: string;
};

/** Brand glyph for one of the 9 networks (wraps PlatformIcon, adds a label). */
export function NetworkIcon({
  network,
  size = 16,
  className,
  label,
}: NetworkIconProps) {
  const name = label ?? networkLabel(network);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      title={name || undefined}
    >
      <PlatformIcon platform={network} size={size} />
    </span>
  );
}

const DOT_CLASS: Record<DeliveryTone, string> = {
  ok: "bg-ok",
  failed: "bg-danger",
  warning: "bg-warning-solid",
  pending: "bg-info",
  none: "bg-text-subtle",
};

const TONE_WORD: Record<DeliveryTone, string> = {
  ok: "published",
  failed: "failed",
  warning: "needs attention",
  pending: "pending",
  none: "",
};

export type NetworkStackItem = {
  network: string;
  /** Raw publication status ("published", "failed", …) or a tone. Omit for no dot. */
  status?: string | null;
  /** Stable key when the same network appears twice (two accounts). */
  key?: string;
  /** Extra tooltip text, e.g. "@handle". */
  hint?: string;
};

type NetworkStackProps = {
  items: NetworkStackItem[];
  size?: number;
  /** Show at most this many icons, then "+N". */
  max?: number;
  /**
   * Which status dots to draw. "problems" (default): failed and needs
   * attention only, since healthy and pending need no badge (the tooltip
   * still names every state). "all": every tone, for live progress views.
   */
  dots?: "problems" | "all";
  className?: string;
};

/**
 * Row of network icons. Only problems get a dot by default (red failed,
 * amber needs attention); `dots="all"` adds green published / blue
 * pending. Used in post rows, calendar chips and Home's Today timeline.
 */
export function NetworkStack({
  items,
  size = 14,
  max = 6,
  dots = "problems",
  className,
}: NetworkStackProps) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {shown.map((item, i) => {
        const tone = item.status == null ? null : deliveryTone(item.status);
        const word = tone ? TONE_WORD[tone] : "";
        const label = [networkLabel(item.network), item.hint, word]
          .filter(Boolean)
          .join(" · ");
        return (
          <span
            key={item.key ?? `${item.network}-${i}`}
            className="relative inline-flex"
            title={label}
          >
            <NetworkIcon network={item.network} size={size} label={label} />
            {tone &&
            tone !== "none" &&
            (dots === "all" || tone === "failed" || tone === "warning") ? (
              <span
                aria-hidden
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-bg-elevated",
                  DOT_CLASS[tone],
                )}
              />
            ) : null}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="text-xs font-medium text-text-muted">+{extra}</span>
      ) : null}
    </span>
  );
}

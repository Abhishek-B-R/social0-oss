import { cn } from "@/lib/utils";
import { PILL_STATUS_LABEL, type PillStatus } from "./status";

/** Soft tint, no border: the color carries the state. */
const TONE: Record<PillStatus, string> = {
  draft: "bg-chip text-text-muted",
  needs_review: "bg-agent-soft text-agent",
  scheduled: "bg-info-soft text-info",
  publishing: "bg-info-soft text-info",
  published: "bg-ok-soft text-ok",
  partly_published: "bg-warning-soft text-warning",
  failed: "bg-danger-soft text-danger",
  healthy: "bg-ok-soft text-ok",
  sign_in_expired: "bg-warning-soft text-warning",
};

const DOT: Record<PillStatus, string> = {
  draft: "bg-text-subtle",
  needs_review: "bg-agent",
  scheduled: "bg-info",
  publishing: "bg-info animate-pulse motion-reduce:animate-none",
  published: "bg-ok",
  partly_published: "bg-warning-solid",
  failed: "bg-danger",
  healthy: "bg-ok",
  sign_in_expired: "bg-warning-solid",
};

type StatusPillProps = {
  status: PillStatus;
  /** Override the default label (e.g. "2 of 3 live"). Keep it short. */
  label?: string;
  size?: "sm" | "md";
  /**
   * Leading dot. Off by default: the tint already says the state. Turn it
   * on only where the dot moves (publishing) or the pill sits on a tint.
   */
  dot?: boolean;
  className?: string;
};

/**
 * Quiet status label in the shared vocabulary (see `status.ts`).
 * Healthy things get no pill at all: render one only when the state is
 * worth reading.
 */
export function StatusPill({
  status,
  label,
  size = "sm",
  dot = false,
  className,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-medium leading-none",
        size === "sm" ? "h-5 px-1.5 text-xs" : "h-6 px-2 text-[13px]",
        TONE[status],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT[status])} />
      ) : null}
      {label ?? PILL_STATUS_LABEL[status]}
    </span>
  );
}

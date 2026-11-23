import { MessageSquareReply, Repeat2 } from "lucide-react";
import { relativeTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import {
  RULE_KIND_LABEL,
  absoluteTime,
  formatInterval,
  metricWord,
  truncate,
  type AutomationRule,
  type RuleKind,
} from "./automation-rules";

/**
 * Rule type as a quiet glyph (the sentence next to it already says what the
 * rule does): reply arrow = Auto-Plug, repeat = Auto-Repost. Named for screen
 * readers and on hover.
 */
export function RuleKindIcon({ kind, className }: { kind: RuleKind; className?: string }) {
  const Icon = kind === "autoplug" ? MessageSquareReply : Repeat2;
  return (
    <span
      title={RULE_KIND_LABEL[kind]}
      className={cn("inline-flex shrink-0 text-text-muted", className)}
    >
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{RULE_KIND_LABEL[kind]}:</span>
    </span>
  );
}

/**
 * The rule as one plain sentence:
 * - Auto-Plug: Reply "Grab the guide…" after 100 likes on X
 * - Auto-Repost: Repost on X every 4 hours, up to 3 times, then reply "…"
 */
export function RuleSentence({
  rule,
  className,
  full = false,
}: {
  rule: AutomationRule;
  className?: string;
  /** Show the whole reply text instead of a short preview. */
  full?: boolean;
}) {
  const quote = rule.comment
    ? `“${full ? rule.comment : truncate(rule.comment, 60)}”`
    : null;
  if (rule.kind === "autoplug") {
    const n = rule.threshold ?? 0;
    return (
      <span className={className}>
        Reply {quote ? <span className="text-text">{quote}</span> : "with your plug"} after{" "}
        <b className="font-semibold text-text">
          {n.toLocaleString()} {metricWord(rule.metricType, n)}
        </b>{" "}
        on X
      </span>
    );
  }
  const max = rule.maxResurfaces ?? 1;
  return (
    <span className={className}>
      Repost on X every{" "}
      <b className="font-semibold text-text">{formatInterval(rule.intervalHours ?? 4)}</b>, up to{" "}
      <b className="font-semibold text-text">
        {max} time{max === 1 ? "" : "s"}
      </b>
      {quote ? (
        <>
          , and reply <span className="text-text">{quote}</span>
        </>
      ) : null}
    </span>
  );
}

/** One line: "2h ago" / "Failed · 7mo ago" / "Next in 3h" / "Not yet". Full time on hover. */
export function LastRunCell({
  lastRunAt,
  lastRunStatus,
  nextRunAt,
  pendingOnly,
}: {
  lastRunAt: string | null;
  lastRunStatus: "done" | "failed" | null;
  nextRunAt: string | null;
  pendingOnly?: boolean;
}) {
  const last = relativeTime(lastRunAt, { compact: true });
  if (last) {
    const failed = lastRunStatus === "failed";
    return (
      <span
        className={cn(
          "whitespace-nowrap text-[13px]",
          failed ? "text-danger" : "text-text-muted",
        )}
        title={absoluteTime(lastRunAt)}
      >
        {failed ? "Failed · " : ""}
        {last === "now" ? "just now" : `${last} ago`}
      </span>
    );
  }
  const next = relativeTime(nextRunAt, { compact: true });
  if (next) {
    return (
      <span
        className="whitespace-nowrap text-[13px] text-text-muted"
        title={absoluteTime(nextRunAt)}
      >
        {/* A next run already in the past reads "due", not "in 3h". */}
        {next === "now" || relativeTime(nextRunAt).endsWith(" ago")
          ? "Next run due"
          : `Next in ${next}`}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap text-[13px] text-text-muted">
      {pendingOnly ? "After publish" : "Not yet"}
    </span>
  );
}

import type { ReactNode } from "react";
import { ArrowLeft, Check, Tray } from "@/icons/phosphor";
import { cn } from "@/lib/utils";

export const headerBtn =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-text-muted transition-colors hover:bg-bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10";

/**
 * Top bar of a thread pane: back (phones), who/where, and the
 * Mark done / Move to Needs reply toggle (E).
 */
export function ThreadHeader({
  avatar,
  title,
  subtitle,
  done,
  replied,
  canToggleDone,
  onToggleDone,
  onBack,
  children,
}: {
  avatar?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Item is out of Needs reply (replied or marked done). */
  done: boolean;
  /** You answered it on the network (shown as a quiet "Replied" mark). */
  replied: boolean;
  /** False when "done" comes from a real reply (nothing to undo here). */
  canToggleDone: boolean;
  onToggleDone: () => void;
  onBack: () => void;
  /** Extra header actions (open, hide post…). */
  children?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:hidden touch:h-10 touch:w-10"
        aria-label="Back to inbox list"
      >
        <ArrowLeft size={16} />
      </button>
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-text">{title}</div>
        {subtitle ? <div className="truncate text-xs text-text-muted">{subtitle}</div> : null}
      </div>
      {children}
      {canToggleDone ? (
        <button
          type="button"
          onClick={onToggleDone}
          className={cn(headerBtn, !done && "text-text")}
          title={done ? "Move back to Needs reply (E)" : "Mark done (E)"}
        >
          {done ? <Tray size={15} aria-hidden /> : <Check size={15} weight="bold" aria-hidden />}
          <span className="hidden sm:inline">{done ? "Move to Needs reply" : "Mark done"}</span>
          <span className="sr-only sm:hidden">{done ? "Move to Needs reply" : "Mark done"}</span>
        </button>
      ) : done && replied ? (
        <span className="inline-flex shrink-0 items-center gap-1 px-1 text-xs text-text-muted">
          <Check size={14} weight="bold" aria-hidden />
          Replied
        </span>
      ) : null}
    </div>
  );
}

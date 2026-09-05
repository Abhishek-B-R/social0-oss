import { cn } from "@/lib/utils";
import type { InboxCommentStatusFilter } from "@/lib/inbox-comment-status";

export type { InboxCommentStatusFilter };

const OPTIONS: Array<{ id: InboxCommentStatusFilter; label: string }> = [
  { id: "unanswered", label: "Unanswered" },
  { id: "answered", label: "Answered" },
  { id: "all", label: "All" },
];

export function InboxStatusFilter({
  value,
  onChange,
}: {
  value: InboxCommentStatusFilter;
  onChange: (next: InboxCommentStatusFilter) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Comment status"
      className="inline-flex w-full items-center gap-0.5 rounded-full border border-border bg-bg-muted p-1 sm:w-auto"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "flex-1 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-[transform,background-color,color] duration-150 ease-out touch-manipulation active:scale-[0.97] touch:min-h-10 sm:flex-none",
            value === opt.id
              ? "bg-foreground text-background shadow-sm"
              : "text-text-muted hover:text-text",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

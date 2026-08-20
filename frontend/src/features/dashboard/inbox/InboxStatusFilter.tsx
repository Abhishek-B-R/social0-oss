import { cn } from "@/lib/utils";

export type InboxCommentStatusFilter =
  | "all"
  | "unread"
  | "unanswered"
  | "answered";

const OPTIONS: Array<{ id: InboxCommentStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "unanswered", label: "Unanswered" },
  { id: "answered", label: "Answered" },
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
            "flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none",
            value === opt.id
              ? "bg-bg-elevated text-text shadow-sm"
              : "text-text-muted hover:text-text",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

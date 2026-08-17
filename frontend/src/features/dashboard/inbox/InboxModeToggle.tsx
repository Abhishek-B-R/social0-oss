import { ChatCircle, EnvelopeSimple } from "@/icons/phosphor";
import { cn } from "@/lib/utils";

export type InboxMode = "comments" | "dms";

const TABS = [
  { id: "comments" as const, label: "Comments", icon: ChatCircle },
  { id: "dms" as const, label: "DMs", icon: EnvelopeSimple },
];

/** Equal-width tabs — selected fill never shifts layout. */
export function InboxModeToggle({
  value,
  onChange,
  className,
}: {
  value: InboxMode;
  onChange: (mode: InboxMode) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Inbox type"
      className={cn(
        "grid w-[15.5rem] shrink-0 grid-cols-2 rounded-full border border-border bg-bg-muted p-1",
        className,
      )}
    >
      {TABS.map((tab) => {
        const selected = value === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors",
              selected
                ? "bg-accent text-accent-foreground"
                : "text-text-muted hover:text-text",
            )}
          >
            <Icon size={14} weight={selected ? "fill" : "regular"} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

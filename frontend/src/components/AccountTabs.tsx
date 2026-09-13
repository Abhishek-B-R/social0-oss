type TabAccount = { id: string; platformUsername?: string | null };

/**
 * Tab strip for picking which connected account a per-account settings panel is
 * editing. The Pinterest and TikTok panels in the post forms and the
 * bulk-schedule dialog all showed this; a caller renders it only when there is
 * more than one account to choose between.
 */
export function AccountTabs(props: {
  accounts: readonly TabAccount[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mb-4 flex rounded-lg border border-border bg-bg-muted/30 p-0.5">
      {props.accounts.map((acc, idx) => (
        <button
          key={acc.id}
          type="button"
          onClick={() => props.onSelect(idx)}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            props.selectedIndex === idx
              ? "bg-bg-elevated text-text shadow-sm"
              : "text-text-muted hover:text-text"
          }`}
        >
          {acc.platformUsername?.trim()
            ? `@${acc.platformUsername}`
            : `Account ${idx + 1}`}
        </button>
      ))}
    </div>
  );
}

import { AccountBubbleSelector } from "@/components/AccountBubbleSelector";

type PickerAccount = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive?: boolean | null;
  isTwitterPremium?: boolean;
  tokenExpired?: boolean;
};

/**
 * "Post to" card at the top of both bulk tools: select-all, remember, search,
 * and the account bubbles. The image and video tools rendered it identically.
 */
export function BulkAccountPicker<TAccount extends PickerAccount>(props: {
  selectableAccounts: TAccount[];
  filteredAccounts: TAccount[];
  selectedIds: Set<string>;
  toggleAccount: (id: string) => void;
  selectAll: () => void;
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
  accountSearch: string;
  setAccountSearch: (value: string) => void;
  accountsLoading: boolean;
  platformName: (platformId: string) => string;
  supportedPlatforms?: string[];
}) {
  const allSelected =
    props.selectableAccounts.length > 0 &&
    props.selectableAccounts.every((a) => props.selectedIds.has(a.id));

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="block text-sm font-semibold text-foreground mb-3">Post to</p>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-between">
        <div className="flex items-center gap-4 sm:gap-5">
          <button
            type="button"
            onClick={props.selectAll}
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs font-medium text-muted-foreground transition-colors touch-manipulation hover:bg-muted touch:min-h-9"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <label className="flex shrink-0 items-center gap-2">
            <input
              type="checkbox"
              checked={props.remember}
              onChange={(e) => props.onRememberChange(e.target.checked)}
              className="rounded border-input bg-bg text-accent focus:ring-accent"
            />
            <span className="text-sm text-foreground">Remember</span>
          </label>
        </div>
        <div className="w-full [&_input]:h-9 sm:min-w-0 sm:flex-1 sm:max-w-[280px]">
          <input
            type="search"
            placeholder="Search accounts..."
            value={props.accountSearch}
            onChange={(e) => props.setAccountSearch(e.target.value)}
            className="h-9 w-full rounded border border-input bg-bg px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
        </div>
      </div>
      <div className="mt-4">
        {props.accountsLoading ? (
          <div className="flex flex-wrap items-center gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center" aria-hidden>
                <div className="h-12 w-12 shrink-0 rounded-full bg-bg-muted animate-pulse border-2 border-transparent" />
                <div className="mt-1.5 h-3 w-14 rounded bg-bg-muted animate-pulse" />
                <div className="mt-1 h-3 w-10 rounded bg-bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <AccountBubbleSelector
            accounts={props.filteredAccounts}
            selectedIds={props.selectedIds}
            onToggleAccount={props.toggleAccount}
            selectAll={props.selectAll}
            platformName={props.platformName}
            compact
            hideSelectAll
            supportedPlatforms={props.supportedPlatforms}
          />
        )}
      </div>
    </div>
  );
}

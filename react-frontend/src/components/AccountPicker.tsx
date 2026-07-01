
import { useState } from "react";

export type AccountPickerAccount = {
  id: string;
  name: string;
  pictureUrl: string | null;
};

type AccountPickerProps = {
  accounts: AccountPickerAccount[];
  title: string;
  subtitle?: string;
  submitLabel?: string;
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: string | null;
};

export function AccountPicker({
  accounts,
  title,
  subtitle = "Select a page to connect:",
  submitLabel = "Connect Selected Page",
  onSelect,
  loading = false,
  error = null,
}: AccountPickerProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedId) onSelect(selectedId);
  };

  return (
    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-1 text-center text-2xl font-bold text-foreground">
        {title}
      </h2>
      <p className="mb-6 text-center text-muted-foreground">{subtitle}</p>

      <form onSubmit={handleSubmit}>
        <div className="space-y-1">
          {accounts.map((account) => (
            <label
              key={account.id}
              className="flex cursor-pointer items-center gap-4 rounded-lg p-3 transition-colors hover:bg-muted/50"
            >
              <input
                type="radio"
                name="account"
                value={account.id}
                checked={selectedId === account.id}
                onChange={() => setSelectedId(account.id)}
                className="h-4 w-4"
              />
              {account.pictureUrl ? (
                <img
                  src={account.pictureUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
              )}
              <span className="font-medium text-foreground">{account.name}</span>
            </label>
          ))}
        </div>

        {error && (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={!selectedId || loading}
          className="mt-6 w-full rounded-xl bg-foreground py-3 font-medium text-background transition-opacity disabled:opacity-50 hover:opacity-90"
        >
          {loading ? "Connecting…" : submitLabel}
        </button>
      </form>
    </div>
  );
}

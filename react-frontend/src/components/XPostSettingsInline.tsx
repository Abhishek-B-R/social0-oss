"use client";

export type XPostSettings = {
  madeWithAi: boolean;
  paidPartnership: boolean;
};

type XPostSettingsInlineProps = {
  value: XPostSettings;
  onChange: (next: XPostSettings) => void;
  isVisible: boolean;
};

export function XPostSettingsInline({
  value,
  onChange,
  isVisible,
}: XPostSettingsInlineProps) {
  if (!isVisible) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-bg-muted/30 p-4">
      <p className="text-sm font-medium text-text">X post labels</p>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-bg px-3 py-2.5">
        <input
          type="checkbox"
          checked={value.madeWithAi}
          onChange={(e) =>
            onChange({ ...value, madeWithAi: e.target.checked })
          }
          className="mt-0.5 rounded border-input bg-bg text-accent focus:ring-accent"
        />
        <span className="text-sm text-text">
          Made with AI
          <span className="mt-0.5 block text-xs text-text-muted">
            Add X&apos;s AI disclosure label for this post.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-bg px-3 py-2.5">
        <input
          type="checkbox"
          checked={value.paidPartnership}
          onChange={(e) =>
            onChange({ ...value, paidPartnership: e.target.checked })
          }
          className="mt-0.5 rounded border-input bg-bg text-accent focus:ring-accent"
        />
        <span className="text-sm text-text">
          Paid partnership
          <span className="mt-0.5 block text-xs text-text-muted">
            Mark this post as a branded/paid partnership on X.
          </span>
        </span>
      </label>
    </div>
  );
}

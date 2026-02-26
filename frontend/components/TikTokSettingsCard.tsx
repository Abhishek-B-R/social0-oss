"use client";

type TikTokSettingsCardAccount = {
  id: string;
  platform: string;
  platformUsername?: string | null;
};

type TikTokSettingsCardProps = {
  selectedAccountIds: string[];
  allAccounts: TikTokSettingsCardAccount[];
  configuredIds?: Set<string>;
  onOpenSettings: (accountId: string) => void;
};

export function TikTokSettingsCard({
  selectedAccountIds,
  allAccounts,
  configuredIds,
  onOpenSettings,
}: TikTokSettingsCardProps) {
  const selectedSet = new Set(selectedAccountIds);
  const tiktokAccounts = allAccounts.filter(
    (a) => selectedSet.has(a.id) && a.platform === "tiktok",
  );

  if (tiktokAccounts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text">TikTok settings</h3>
          <p className="mt-1 text-xs text-text-muted">
            Required settings for TikTok posts (privacy level, interactions,
            disclosures).
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {tiktokAccounts.map((acc) => {
          const username = acc.platformUsername?.trim()
            ? `@${acc.platformUsername}`
            : "TikTok account";
          const isConfigured = configuredIds?.has(acc.id) ?? false;

          return (
            <div
              key={acc.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-muted/50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">
                  {username}
                </p>
                <p
                  className={
                    isConfigured
                      ? "mt-0.5 text-xs font-medium text-accent"
                      : "mt-0.5 text-xs font-medium text-amber-600"
                  }
                >
                  {isConfigured ? "Configured" : "Needs settings"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenSettings(acc.id)}
                className="shrink-0 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs font-semibold text-text shadow-sm hover:bg-bg-subtle"
              >
                Open
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}


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
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">TikTok settings</h3>
          <p className="mt-1 text-xs text-gray-500">
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
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {username}
                </p>
                <p
                  className={
                    isConfigured
                      ? "mt-0.5 text-xs font-medium text-emerald-700"
                      : "mt-0.5 text-xs font-medium text-amber-700"
                  }
                >
                  {isConfigured ? "Configured" : "Needs settings"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenSettings(acc.id)}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
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


import {
  getMostRestrictiveLimit,
  PLATFORM_DISPLAY_NAMES,
  getLimitForAccount,
} from "@social0/shared/browser";

interface Account {
  platform: string;
  isTwitterPremium?: boolean | null;
  platformUsername?: string | null;
}

interface Props {
  caption: string;
  selectedAccounts: Account[];
}

export function CaptionCounter({ caption, selectedAccounts }: Props) {
  const limit = getMostRestrictiveLimit(selectedAccounts);
  const count = caption.length;
  const pct = limit > 0 ? count / limit : 0;

  const truncatedPlatforms = selectedAccounts.filter(
    (a) => count > getLimitForAccount(a),
  );

  return (
    <div className="space-y-2">
      {/* Counter */}
      <div className="flex justify-end">
        <span
          className={`text-xs font-mono tabular-nums ${
            pct >= 1
              ? "text-red-500"
              : pct >= 0.9
                ? "text-yellow-500"
                : "text-muted-foreground"
          }`}
        >
          {count} / {limit}
        </span>
      </div>

      {/* Per-platform truncation warning */}
      {truncatedPlatforms.length > 0 && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          ⚠ Caption will be trimmed for:{" "}
          {truncatedPlatforms
            .map((a) => {
              const name = PLATFORM_DISPLAY_NAMES[a.platform] ?? a.platform;
              const handle = a.platformUsername?.trim();
              return handle ? `${name} (@${handle})` : name;
            })
            .join(", ")}
          <span className="block mt-0.5 text-muted-foreground">
            We&apos;ll automatically trim to each platform&apos;s limit before
            posting.
          </span>
        </div>
      )}
    </div>
  );
}

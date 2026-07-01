
import {
  getResurfacePlatforms,
  isWithinResurfaceWindow,
  isWithinAutoPlugWindow,
} from "@/lib/resurface-utils";
import { AutoResurfacePanel, type AutoResurfaceConfig } from "./AutoResurfacePanel";
import { AutoPlugPanel, type AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";

export type AutoFeaturesAccount = {
  id: string;
  platform: string;
  platformUsername?: string | null;
  profileImageUrl?: string | null;
};

type AutoFeaturesCardProps = {
  selectedAccountIds: string[];
  allAccounts: AutoFeaturesAccount[];
  postId?: string;
  publishedAt?: Date;
  onResurfaceChange: (config: AutoResurfaceConfig | null) => void;
  onAutoPlugChange: (config: AutoPlugConfig | null) => void;
  resurfaceInitialConfig?: Partial<AutoResurfaceConfig> | null;
  autoPlugInitialConfig?: Partial<AutoPlugConfig> | null;
  /** When true, show Auto-Plug even outside the 6h window (e.g. editing an existing plug). */
  ignoreAutoPlugTimeWindow?: boolean;
  /** When true, show Auto-Repost even outside the 24h window (e.g. editing an existing schedule). */
  ignoreResurfaceTimeWindow?: boolean;
  /** When false, hide Auto-Repost (e.g. plan doesn’t include it). */
  allowAutoRepost?: boolean;
  /** When false, hide Auto-Plug (e.g. plan doesn’t include it). */
  allowAutoPlug?: boolean;
  /** When false, Auto-Repost toggle starts off (paused schedule). */
  initialResurfaceEnabled?: boolean;
  use24HourTimeFormat?: boolean;
};

export function AutoFeaturesCard({
  selectedAccountIds,
  allAccounts,
  postId,
  publishedAt,
  onResurfaceChange,
  onAutoPlugChange,
  resurfaceInitialConfig,
  autoPlugInitialConfig,
  ignoreAutoPlugTimeWindow = false,
  ignoreResurfaceTimeWindow = false,
  allowAutoRepost = true,
  allowAutoPlug = true,
  initialResurfaceEnabled,
  use24HourTimeFormat = false,
}: AutoFeaturesCardProps) {
  const hasX = getResurfacePlatforms(selectedAccountIds, allAccounts).length > 0;
  const resurfaceVisible =
    hasX &&
    (ignoreResurfaceTimeWindow ||
      publishedAt === undefined ||
      isWithinResurfaceWindow(publishedAt));
  const autoPlugVisible =
    hasX &&
    (ignoreAutoPlugTimeWindow ||
      publishedAt === undefined ||
      isWithinAutoPlugWindow(publishedAt));

  const showResurface = resurfaceVisible && allowAutoRepost;
  const showAutoPlug = autoPlugVisible && allowAutoPlug;

  if (!showResurface && !showAutoPlug) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {showResurface && (
          <div
            className={`min-w-0 ${showAutoPlug ? "md:border-r md:border-border md:pr-6" : ""}`}
          >
            <AutoResurfacePanel
              selectedAccountIds={selectedAccountIds}
              allAccounts={allAccounts}
              postId={postId}
              publishedAt={publishedAt}
              onChange={onResurfaceChange}
              initialConfig={resurfaceInitialConfig}
              embedded
              ignorePublicationTimeWindow={ignoreResurfaceTimeWindow}
              initialEnabled={initialResurfaceEnabled}
              use24HourTimeFormat={use24HourTimeFormat}
            />
          </div>
        )}
        {showAutoPlug && (
          <div
            className={`min-w-0 ${showResurface ? "md:pl-6" : ""}`}
          >
            <AutoPlugPanel
              selectedAccountIds={selectedAccountIds}
              allAccounts={allAccounts}
              postId={postId}
              publishedAt={publishedAt}
              onChange={onAutoPlugChange}
              initialConfig={autoPlugInitialConfig}
              embedded
              ignorePublicationTimeWindow={ignoreAutoPlugTimeWindow}
            />
          </div>
        )}
      </div>
    </div>
  );
}

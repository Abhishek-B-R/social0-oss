"use client";

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
}: AutoFeaturesCardProps) {
  const hasX = getResurfacePlatforms(selectedAccountIds, allAccounts).length > 0;
  const resurfaceVisible =
    hasX &&
    (publishedAt === undefined || isWithinResurfaceWindow(publishedAt));
  const autoPlugVisible =
    hasX &&
    (publishedAt === undefined || isWithinAutoPlugWindow(publishedAt));

  if (!resurfaceVisible && !autoPlugVisible) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {resurfaceVisible && (
          <div
            className={`min-w-0 ${autoPlugVisible ? "md:border-r md:border-border md:pr-6" : ""}`}
          >
            <AutoResurfacePanel
              selectedAccountIds={selectedAccountIds}
              allAccounts={allAccounts}
              postId={postId}
              publishedAt={publishedAt}
              onChange={onResurfaceChange}
              initialConfig={resurfaceInitialConfig}
              embedded
            />
          </div>
        )}
        {autoPlugVisible && (
          <div
            className={`min-w-0 ${resurfaceVisible ? "md:pl-6" : ""}`}
          >
            <AutoPlugPanel
              selectedAccountIds={selectedAccountIds}
              allAccounts={allAccounts}
              postId={postId}
              publishedAt={publishedAt}
              onChange={onAutoPlugChange}
              initialConfig={autoPlugInitialConfig}
              embedded
            />
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { AccountAvatar } from "@/components/AccountAvatar";
import {
  getResurfacePlatforms,
  isWithinAutoPlugWindow,
} from "@/lib/resurface-utils";

export type AutoPlugConfig = {
  metricType: "likes" | "retweets";
  threshold: number;
  plugComment: string;
};

export type ConnectedAccount = {
  id: string;
  platform: string;
  platformUsername?: string | null;
  profileImageUrl?: string | null;
};

const MAX_PLUG_COMMENT_LENGTH = 280;
const DEFAULT_THRESHOLD = 100;

type AutoPlugPanelProps = {
  selectedAccountIds: string[];
  allAccounts: ConnectedAccount[];
  postId?: string;
  publishedAt?: Date;
  onChange: (config: AutoPlugConfig | null) => void;
  initialConfig?: Partial<AutoPlugConfig> | null;
  /** When true, render without card wrapper (for use inside combined AutoFeaturesCard) */
  embedded?: boolean;
};

export function AutoPlugPanel({
  selectedAccountIds,
  allAccounts,
  publishedAt,
  onChange,
  initialConfig,
  embedded = false,
}: AutoPlugPanelProps) {
  const supportedPlatforms = getResurfacePlatforms(
    selectedAccountIds,
    allAccounts,
  );
  const visible =
    supportedPlatforms.length > 0 &&
    (publishedAt === undefined || isWithinAutoPlugWindow(publishedAt));

  useEffect(() => {
    if (!visible) onChange(null);
  }, [visible, onChange]);

  if (!visible) return null;

  const xAccount = allAccounts.find(
    (a) => a.platform === "twitter_x" && selectedAccountIds.includes(a.id),
  );

  return (
    <AutoPlugPanelInner
      xAccount={xAccount ?? null}
      initialConfig={initialConfig}
      onChange={onChange}
      embedded={embedded}
    />
  );
}

function AutoPlugPanelInner({
  xAccount,
  initialConfig,
  onChange,
  embedded = false,
}: {
  xAccount: ConnectedAccount | null;
  initialConfig?: Partial<AutoPlugConfig> | null;
  onChange: (config: AutoPlugConfig | null) => void;
  embedded?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(
    initialConfig?.threshold ?? DEFAULT_THRESHOLD,
  );
  const [metricType, setMetricType] = useState<"likes" | "retweets">(
    initialConfig?.metricType ?? "likes",
  );
  const [plugComment, setPlugComment] = useState(
    initialConfig?.plugComment ?? "",
  );

  useEffect(() => {
    if (!enabled) {
      onChange(null);
      return;
    }
    onChange({
      metricType,
      threshold: Math.max(1, Math.round(threshold)),
      plugComment: plugComment.slice(0, MAX_PLUG_COMMENT_LENGTH).trim(),
    });
  }, [enabled, metricType, threshold, plugComment, onChange]);

  const commentSlice = plugComment.slice(0, MAX_PLUG_COMMENT_LENGTH);
  const charCount = commentSlice.length;

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">🔌 Auto-Plug</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Reply automatically when this post hits a milestone.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((e) => !e)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-emerald-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            } mt-0.5`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-600">
              If this post hits:
            </span>
            <input
              type="number"
              min={1}
              value={threshold}
              onChange={(e) =>
                setThreshold(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <div className="flex rounded-full border border-gray-200 bg-gray-50 p-0.5">
              <button
                type="button"
                onClick={() => setMetricType("likes")}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  metricType === "likes"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600"
                }`}
              >
                ♡ Likes
              </button>
              <button
                type="button"
                onClick={() => setMetricType("retweets")}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  metricType === "retweets"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600"
                }`}
              >
                ↺ Retweets
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reply automatically with:
            </label>
            <textarea
              value={plugComment}
              onChange={(e) => setPlugComment(e.target.value)}
              placeholder="Your reply tweet..."
              maxLength={MAX_PLUG_COMMENT_LENGTH + 1}
              rows={3}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500 mb-2">Preview</p>
              <div className="flex gap-3">
                <div className="shrink-0">
                  <AccountAvatar
                    profileImageUrl={xAccount?.profileImageUrl}
                    username={xAccount?.platformUsername}
                    platform="twitter_x"
                    size="md"
                    className="h-10 w-10"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {xAccount?.platformUsername
                      ? `@${xAccount.platformUsername}`
                      : "X account"}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-700 whitespace-pre-wrap wrap-break-word">
                    {commentSlice || "Your reply will appear here."}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-right text-xs text-gray-400">
                {charCount}/{MAX_PLUG_COMMENT_LENGTH}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
  return embedded ? (
    <div className="min-w-0">{content}</div>
  ) : (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {content}
    </div>
  );
}

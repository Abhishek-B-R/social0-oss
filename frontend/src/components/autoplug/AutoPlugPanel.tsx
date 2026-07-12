
import { useState, useEffect, useRef } from "react";
import { AccountAvatar } from "@/components/AccountAvatar";
import {
  getResurfacePlatforms,
  isWithinAutoPlugWindow,
} from "@social0/shared/browser";

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
  isTwitterPremium?: boolean | null;
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
  /** When true, show only the form (no toggle); for use inside settings modal */
  modalMode?: boolean;
  /** Skip the 6h post-publish window (e.g. post detail page editing existing Auto-Plug). */
  ignorePublicationTimeWindow?: boolean;
};

export function AutoPlugPanel({
  selectedAccountIds,
  allAccounts,
  publishedAt,
  onChange,
  initialConfig,
  embedded = false,
  modalMode = false,
  ignorePublicationTimeWindow = false,
}: AutoPlugPanelProps) {
  const supportedPlatforms = getResurfacePlatforms(
    selectedAccountIds,
    allAccounts,
  );
  const visible =
    supportedPlatforms.length > 0 &&
    (ignorePublicationTimeWindow ||
      publishedAt === undefined ||
      isWithinAutoPlugWindow(publishedAt));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!visible && !modalMode) onChangeRef.current(null);
  }, [visible, modalMode]);

  if (!visible && !modalMode) return null;

  const xAccount = allAccounts.find(
    (a) => a.platform === "twitter_x" && selectedAccountIds.includes(a.id),
  );

  return (
    <AutoPlugPanelInner
      xAccount={xAccount ?? null}
      initialConfig={initialConfig}
      onChange={onChange}
      embedded={embedded}
      modalMode={modalMode}
    />
  );
}

function AutoPlugPanelInner({
  xAccount,
  initialConfig,
  onChange,
  embedded = false,
  modalMode = false,
}: {
  xAccount: ConnectedAccount | null;
  initialConfig?: Partial<AutoPlugConfig> | null;
  onChange: (config: AutoPlugConfig | null) => void;
  embedded?: boolean;
  modalMode?: boolean;
}) {
  const [enabled, setEnabled] = useState(modalMode || !!initialConfig);
  const [threshold, setThreshold] = useState(
    initialConfig?.threshold ?? DEFAULT_THRESHOLD,
  );
  const [metricType, setMetricType] = useState<"likes" | "retweets">(
    initialConfig?.metricType ?? "likes",
  );
  const [plugComment, setPlugComment] = useState(
    initialConfig?.plugComment ?? "",
  );
  const plugCommentTrimmed = plugComment
    .slice(0, MAX_PLUG_COMMENT_LENGTH)
    .trim();
  const plugCommentMissing =
    (enabled || modalMode) && plugCommentTrimmed.length === 0;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const notify = onChangeRef.current;
    if (!enabled) {
      notify(null);
      return;
    }
    if (plugCommentTrimmed.length === 0) {
      notify(null);
      return;
    }
    notify({
      metricType,
      threshold: Math.max(1, Math.round(threshold)),
      plugComment: plugCommentTrimmed,
    });
  }, [enabled, metricType, threshold, plugCommentTrimmed]);

  const commentSlice = plugComment.slice(0, MAX_PLUG_COMMENT_LENGTH);
  const charCount = commentSlice.length;

  const content = (
    <>
      {!modalMode && (
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {" "}
              Auto-Plug
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reply automatically when this post hits a milestone.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((e) => !e)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
              enabled ? "bg-emerald-600" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0.5"
              } mt-0.5`}
            />
          </button>
        </div>
      )}

      {(enabled || modalMode) && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              If this post hits:
            </span>
            <input
              type="number"
              min={1}
              value={threshold}
              onChange={(e) =>
                setThreshold(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              className="w-20 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            <div className="flex rounded-full border border-border bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setMetricType("likes")}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  metricType === "likes"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                ♡ Likes
              </button>
              <button
                type="button"
                onClick={() => setMetricType("retweets")}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  metricType === "retweets"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                ↺ Retweets
              </button>
            </div>
          </div>

          {xAccount && (
            <p className="text-xs text-muted-foreground">
              Auto-Plug will watch{" "}
              {xAccount.platformUsername
                ? `@${xAccount.platformUsername}`
                : "your X account"}
              {"'"}s tweet. If you selected more than one X account, it uses the
              first one.
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Reply automatically with:
            </label>
            <textarea
              value={plugComment}
              onChange={(e) => setPlugComment(e.target.value)}
              placeholder="Your reply tweet..."
              maxLength={MAX_PLUG_COMMENT_LENGTH + 1}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {plugCommentMissing && (
              <p
                className="mt-2 text-xs font-medium text-destructive"
                role="alert"
              >
                Auto-Plug message can’t be empty.
              </p>
            )}
            <div className="mt-2 rounded-lg border border-border bg-muted p-3">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <div className="flex gap-3">
                <div className="shrink-0">
                  <AccountAvatar
                    profileImageUrl={xAccount?.profileImageUrl}
                    username={xAccount?.platformUsername}
                    platform="twitter_x"
                    isTwitterPremium={false}
                    size="md"
                    className="h-10 w-10"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
                    {xAccount?.platformUsername
                      ? `@${xAccount.platformUsername}`
                      : "X account"}
                    {xAccount?.isTwitterPremium && (
                      <img
                        src="/icons/twitter-premium.svg"
                        alt="X Premium"
                        className="h-3.5 w-3.5"
                      />
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground/80 whitespace-pre-wrap wrap-break-word">
                    {commentSlice || "Your reply will appear here."}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-right text-xs text-muted-foreground">
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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      {content}
    </div>
  );
}

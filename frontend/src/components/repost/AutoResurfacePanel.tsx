
import { useState, useEffect, useRef } from "react";
import {
  getResurfacePlatforms,
  getResurfacePlatformLabels,
  isWithinResurfaceWindow,
} from "@social0/shared";

const INTERVAL_OPTIONS = [
  { value: 0.5, label: "0.5h" },
  { value: 1, label: "1h" },
  { value: 2, label: "2h" },
  { value: 4, label: "4h" },
  { value: 6, label: "6h" },
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
];

const MAX_OPTIONS = [1, 2, 3, 5, 10];

const MAX_EXTRA_INTERVALS = 2; // 1 main + 2 extra = 3 total

export type AutoResurfaceConfig = {
  intervalHours: number;
  maxResurfaces: number;
  plugComment: string;
};

export type ConnectedAccountLike = {
  id: string;
  platform: string;
};

type AutoResurfacePanelProps = {
  selectedAccountIds: string[];
  allAccounts: ConnectedAccountLike[];
  postId?: string;
  publishedAt?: Date;
  onChange: (config: AutoResurfaceConfig | null) => void;
  /** Optional initial config (e.g. from form prefill) */
  initialConfig?: Partial<AutoResurfaceConfig> | null;
  /** When true, render without card wrapper (for use inside combined AutoFeaturesCard) */
  embedded?: boolean;
  /** When true, show only the form (no toggle); for use inside settings modal */
  modalMode?: boolean;
  /** When true, show times in 24h format */
  use24HourTimeFormat?: boolean;
  /** Skip the 24h post-publish window (e.g. post detail page editing existing schedule). */
  ignorePublicationTimeWindow?: boolean;
  /** When set, overrides default enabled = !!initialConfig (e.g. paused schedule: false). */
  initialEnabled?: boolean;
};

function formatFirstReshare(
  intervalHours: number,
  use24HourTimeFormat = false,
): string {
  const t = new Date();
  t.setTime(t.getTime() + intervalHours * 60 * 60 * 1000);
  return t.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: !use24HourTimeFormat,
  });
}

export function AutoResurfacePanel({
  selectedAccountIds,
  allAccounts,
  postId,
  publishedAt,
  onChange,
  initialConfig,
  embedded = false,
  modalMode = false,
  use24HourTimeFormat = false,
  ignorePublicationTimeWindow = false,
  initialEnabled,
}: AutoResurfacePanelProps) {
  const supportedPlatforms = getResurfacePlatforms(
    selectedAccountIds,
    allAccounts,
  );
  const visible =
    supportedPlatforms.length > 0 &&
    (ignorePublicationTimeWindow ||
      publishedAt === undefined ||
      isWithinResurfaceWindow(publishedAt));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!visible && !modalMode) onChangeRef.current(null);
  }, [visible, modalMode]);

  if (!visible && !modalMode) return null;

  const labels = getResurfacePlatformLabels(selectedAccountIds, allAccounts);
  const subtitle = labels.length > 0 ? `(${labels.join(", ")})` : "";

  return (
    <AutoResurfacePanelInner
      subtitle={subtitle}
      initialConfig={initialConfig}
      initialEnabled={initialEnabled}
      onChange={onChange}
      embedded={embedded}
      modalMode={modalMode}
      use24HourTimeFormat={use24HourTimeFormat}
    />
  );
}

function AutoResurfacePanelInner({
  subtitle,
  initialConfig,
  initialEnabled,
  onChange,
  embedded = false,
  modalMode = false,
  use24HourTimeFormat = false,
}: {
  subtitle: string;
  initialConfig?: Partial<AutoResurfaceConfig> | null;
  initialEnabled?: boolean;
  onChange: (config: AutoResurfaceConfig | null) => void;
  embedded?: boolean;
  modalMode?: boolean;
  use24HourTimeFormat?: boolean;
}) {
  const [enabled, setEnabled] = useState(() => {
    if (modalMode) return true;
    if (initialEnabled !== undefined) return initialEnabled;
    return !!initialConfig;
  });
  const [intervalHours, setIntervalHours] = useState(
    initialConfig?.intervalHours ?? 4,
  );
  const [maxResurfaces, setMaxResurfaces] = useState(
    initialConfig?.maxResurfaces ?? 1,
  );
  const [plugComment, setPlugComment] = useState(
    initialConfig?.plugComment ?? "",
  );
  const [extraIntervalHours, setExtraIntervalHours] = useState<number[]>([]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const notify = onChangeRef.current;
    if (!enabled) {
      notify(null);
      return;
    }
    notify({
      intervalHours,
      maxResurfaces,
      plugComment: plugComment.trim(),
    });
  }, [enabled, intervalHours, maxResurfaces, plugComment]);

  const addExtraInterval = () => {
    if (extraIntervalHours.length >= MAX_EXTRA_INTERVALS) return;
    setExtraIntervalHours((prev) => [...prev, 6]);
  };

  const removeExtraInterval = (index: number) => {
    setExtraIntervalHours((prev) => prev.filter((_, i) => i !== index));
  };

  const setExtraInterval = (index: number, value: number) => {
    setExtraIntervalHours((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const content = (
    <>
      {!modalMode && (
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Auto-Repost{" "}
              {subtitle && (
                <span className="text-muted-foreground font-normal">
                  {subtitle}
                </span>
              )}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reshare this post at intervals so it reaches more of your
              followers. Only supported on X for now.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((e) => !e)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
              enabled ? "bg-accent" : "bg-muted"
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
        <div className="space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Reshare every
              </label>
              <select
                value={intervalHours}
                onChange={(e) => setIntervalHours(Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Number of reshares
              </label>
              <select
                value={maxResurfaces}
                onChange={(e) => setMaxResurfaces(Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {MAX_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            First reshare:{" "}
            {formatFirstReshare(intervalHours, use24HourTimeFormat)}, if
            published now
          </p>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Quote tweet text (optional)
            </label>
            <input
              type="text"
              value={plugComment}
              onChange={(e) => setPlugComment(e.target.value)}
              placeholder="Add text to post as a quote tweet with each reshare"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Auto-Repost will requeue this X post
            {subtitle ? ` for ${subtitle}` : ""}. If you posted to more than one
            X account, it still uses a single tweet to avoid spammy behaviour.
          </p>

          {extraIntervalHours.length < MAX_EXTRA_INTERVALS && (
            <button
              type="button"
              onClick={addExtraInterval}
              className="flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current">
                +
              </span>
              Add another retweet interval
            </button>
          )}

          {extraIntervalHours.map((hours, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">
                Then after
              </span>
              <select
                value={hours}
                onChange={(e) =>
                  setExtraInterval(index, Number(e.target.value))
                }
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">hours</span>
              <button
                type="button"
                onClick={() => removeExtraInterval(index)}
                className="rounded-md bg-red-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                aria-label="Remove interval"
              >
                Remove
              </button>
            </div>
          ))}
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

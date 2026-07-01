
import { useEffect, useRef, useState } from "react";

export type TikTokPostSettings = {
  privacy_level: string;
  video_title: string;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  brand_content_toggle: boolean;
  brand_organic: boolean;
  brand_content: boolean;
  post_as_draft: boolean;
  mark_ai_generated: boolean;
  tiktok_post_consent: boolean;
};

type TikTokSettingsProps = {
  accountId: string;
  value: TikTokPostSettings;
  onChange: (settings: TikTokPostSettings) => void;
  /** Kept for call-site compatibility; the form no longer fetches anything. */
  onError?: (error: string) => void;
  onCreatorInfoLoaded?: (info: { max_video_duration?: number }) => void;
  mediaType?: "video" | "photo";
  videoDurationSec?: number | null;
  showPreviewHint?: boolean;
};

export const DEFAULT_TIKTOK_POST_SETTINGS: TikTokPostSettings = {
  privacy_level: "PUBLIC_TO_EVERYONE",
  video_title: "",
  disable_comment: false,
  disable_duet: false,
  disable_stitch: false,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
  post_as_draft: false,
  mark_ai_generated: false,
  tiktok_post_consent: true,
};

const PRIVACY_OPTIONS: { value: string; label: string; hint: string }[] = [
  {
    value: "PUBLIC_TO_EVERYONE",
    label: "Public",
    hint: "Everyone can view this post",
  },
  {
    value: "MUTUAL_FOLLOW_FRIENDS",
    label: "Friends",
    hint: "Friends who follow you back can view this post",
  },
  {
    value: "FOLLOWER_OF_CREATOR",
    label: "Followers",
    hint: "Your followers can view this post",
  },
  {
    value: "SELF_ONLY",
    label: "Only me",
    hint: "Only you can view this post",
  },
];

const TITLE_MAX = 85;

/** Normalizes stored/remembered settings into the simplified form's shape. */
function normalize(value: TikTokPostSettings): TikTokPostSettings {
  return {
    ...DEFAULT_TIKTOK_POST_SETTINGS,
    ...value,
    privacy_level: value.privacy_level?.trim()
      ? value.privacy_level
      : "PUBLIC_TO_EVERYONE",
    video_title: (value.video_title ?? "").slice(0, TITLE_MAX),
    // Consent checkbox was removed from the UI; agreement is implied by posting.
    tiktok_post_consent: true,
  };
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
        checked
          ? "bg-accent hover:bg-accent-hover"
          : "bg-gray-300 hover:bg-gray-400 dark:bg-white/25 dark:hover:bg-white/35"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="mt-0.5 text-xs text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function TikTokSettings({
  accountId,
  value,
  onChange,
  mediaType = "video",
}: TikTokSettingsProps) {
  const [settings, setSettings] = useState<TikTokPostSettings>(() =>
    normalize(value),
  );

  // Push normalized defaults up once per account so the parent always holds
  // a publishable settings object even if the user never touches the form.
  const pushedFor = useRef<string | null>(null);
  useEffect(() => {
    if (accountId && pushedFor.current !== accountId) {
      pushedFor.current = accountId;
      const normalized = normalize(value);
      setSettings(normalized);
      onChange(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const update = (patch: Partial<TikTokPostSettings>) => {
    const next = { ...settings, ...patch };
    // Turning the disclosure master toggle off clears both sub-options
    if (!next.brand_content_toggle) {
      next.brand_organic = false;
      next.brand_content = false;
    }
    // TikTok forbids branded content on private posts
    if (next.brand_content && next.privacy_level === "SELF_ONLY") {
      next.privacy_level = "PUBLIC_TO_EVERYONE";
    }
    setSettings(next);
    onChange(next);
  };

  const selectedPrivacy =
    PRIVACY_OPTIONS.find((o) => o.value === settings.privacy_level) ??
    PRIVACY_OPTIONS[0];

  return (
    <div className="divide-y divide-border text-text">
      {/* Title */}
      <div className="py-4">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="tiktok-title"
            className="text-sm font-medium text-text"
          >
            TikTok Title
          </label>
          {!settings.video_title.trim() && (
            <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-muted">
              No title
            </span>
          )}
        </div>
        <input
          id="tiktok-title"
          type="text"
          value={settings.video_title}
          onChange={(e) =>
            update({ video_title: e.target.value.slice(0, TITLE_MAX) })
          }
          placeholder="Enter your title here"
          maxLength={TITLE_MAX}
          className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted">
            On TikTok, you can optionally provide a unique title for your post.
          </p>
          <p className="shrink-0 text-xs text-text-muted">
            {settings.video_title.length}/{TITLE_MAX}
          </p>
        </div>
      </div>

      {/* Send as draft */}
      <SettingRow
        title="Send to TikTok as Draft"
        description="Post will be saved as draft inside of TikTok instead of publishing immediately. Check your TikTok inbox notifications to continue editing and publish."
      >
        <Toggle
          checked={settings.post_as_draft}
          onChange={() => update({ post_as_draft: !settings.post_as_draft })}
          label="Send to TikTok as Draft"
        />
      </SettingRow>

      {/* Privacy */}
      <SettingRow title="Privacy Setting" description={selectedPrivacy.hint}>
        <select
          value={settings.privacy_level}
          onChange={(e) => update({ privacy_level: e.target.value })}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          {PRIVACY_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={settings.brand_content && option.value === "SELF_ONLY"}
            >
              {option.label}
              {settings.brand_content && option.value === "SELF_ONLY"
                ? " (not available for branded content)"
                : ""}
            </option>
          ))}
        </select>
      </SettingRow>

      {/* Comments */}
      <SettingRow
        title="Allow Comments"
        description="Viewers can comment on this post"
      >
        <Toggle
          checked={!settings.disable_comment}
          onChange={() =>
            update({ disable_comment: !settings.disable_comment })
          }
          label="Allow Comments"
        />
      </SettingRow>

      {/* Duet / Stitch - videos only */}
      {mediaType !== "photo" && (
        <>
          <SettingRow
            title="Allow Duet"
            description="Others can create Duets with this video"
          >
            <Toggle
              checked={!settings.disable_duet}
              onChange={() => update({ disable_duet: !settings.disable_duet })}
              label="Allow Duet"
            />
          </SettingRow>
          <SettingRow
            title="Allow Stitch"
            description="Others can use parts of this video in theirs"
          >
            <Toggle
              checked={!settings.disable_stitch}
              onChange={() =>
                update({ disable_stitch: !settings.disable_stitch })
              }
              label="Allow Stitch"
            />
          </SettingRow>
        </>
      )}

      {/* Commercial content disclosure */}
      <div className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">
              Disclose Commercial Content
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              Indicate if this content promotes a brand, product, or service
            </p>
          </div>
          <Toggle
            checked={settings.brand_content_toggle}
            onChange={() =>
              update({ brand_content_toggle: !settings.brand_content_toggle })
            }
            label="Disclose Commercial Content"
          />
        </div>

        {settings.brand_content_toggle && (
          <div className="mt-3 space-y-3 rounded-lg border border-border bg-bg p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.brand_organic}
                onChange={(e) => update({ brand_organic: e.target.checked })}
                className="mt-0.5 size-4 shrink-0 rounded border-border text-accent focus:ring-accent"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text">Your Brand</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  You&apos;re promoting yourself or your own business
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.brand_content}
                onChange={(e) => update({ brand_content: e.target.checked })}
                className="mt-0.5 size-4 shrink-0 rounded border-border text-accent focus:ring-accent"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text">Branded Content</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Paid partnership - you&apos;re promoting another brand or a
                  third party
                </span>
              </span>
            </label>
            {!settings.brand_organic && !settings.brand_content ? (
              <p className="text-xs text-destructive" role="alert">
                Select at least one option to post with commercial disclosure.
              </p>
            ) : (
              <p className="text-xs italic text-text-muted">
                {settings.brand_content
                  ? 'Your post will be labeled "Paid partnership".'
                  : 'Your post will be labeled "Promotional content".'}
              </p>
            )}
          </div>
        )}
      </div>

      <p className="pt-3 text-xs italic text-text-muted">
        By posting, you agree to TikTok&apos;s Music Usage Confirmation
        {settings.brand_content ? " and Branded Content Policy" : ""}.
      </p>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";

type TikTokCreatorInfo = {
  data?: {
    privacy_level_options?: string[];
    max_video_duration?: number;
    creator_username?: string;
    creator_nickname?: string;
    creator_avatar_url?: string;
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type TikTokSettingsProps = {
  accountId: string;
  value: TikTokPostSettings;
  onChange: (settings: TikTokPostSettings) => void;
  onError: (error: string) => void;
  onCreatorInfoLoaded?: (info: { max_video_duration?: number }) => void;
};

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
};

const DEFAULT_SETTINGS: TikTokPostSettings = {
  privacy_level: "",
  video_title: "",
  disable_comment: false,
  disable_duet: false,
  disable_stitch: false,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
  post_as_draft: false,
  mark_ai_generated: false,
};

export function TikTokSettings({
  accountId,
  value,
  onChange,
  onError,
  onCreatorInfoLoaded,
}: TikTokSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(
    null,
  );
  const [settings, setSettings] = useState<TikTokPostSettings>(
    value.privacy_level !== undefined
      ? {
          ...value,
          video_title: value.video_title ?? "",
          brand_organic:
            (value as any).brand_organic_toggle === true
              ? true
              : (value.brand_organic ?? false),
          brand_content:
            (value as any).brand_organic_toggle === false &&
            value.brand_content_toggle
              ? true
              : (value.brand_content ?? false),
          post_as_draft: (value as any).post_as_draft ?? false,
          mark_ai_generated: (value as any).mark_ai_generated ?? false,
        }
      : {
          privacy_level: "",
          video_title: "",
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
          brand_content_toggle: false,
          brand_organic: false,
          brand_content: false,
          post_as_draft: false,
          mark_ai_generated: false,
        },
  );

  useEffect(() => {
    if (
      value.privacy_level !== settings.privacy_level ||
      value.video_title !== settings.video_title ||
      value.disable_comment !== settings.disable_comment ||
      value.disable_duet !== settings.disable_duet ||
      value.disable_stitch !== settings.disable_stitch ||
      value.brand_content_toggle !== settings.brand_content_toggle ||
      value.brand_organic !== settings.brand_organic ||
      value.brand_content !== settings.brand_content ||
      (value as any).post_as_draft !== settings.post_as_draft ||
      (value as any).mark_ai_generated !== settings.mark_ai_generated
    ) {
      setSettings({
        ...value,
        video_title: value.video_title ?? "",
        brand_organic: value.brand_organic ?? false,
        brand_content: value.brand_content ?? false,
        post_as_draft: (value as any).post_as_draft ?? false,
        mark_ai_generated: (value as any).mark_ai_generated ?? false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    value.privacy_level,
    value.video_title,
    value.disable_comment,
    value.disable_duet,
    value.disable_stitch,
    value.brand_content_toggle,
    value.brand_organic,
    value.brand_content,
    (value as any).post_as_draft,
    (value as any).mark_ai_generated,
  ]);

  const hasPushedInitial = useRef(false);

  useEffect(() => {
    const fetchCreatorInfo = async () => {
      try {
        const res = await fetch(
          `/api/tiktok/creator-info?accountId=${accountId}`,
        );
        const data = await res.json();
        if (!res.ok) {
          onError(data.error || "Failed to load TikTok settings");
          return;
        }

        const errorCode = data.error?.code;
        if (errorCode === "spam_risk_too_many_posts") {
          onError("Daily post limit reached. Please try again tomorrow.");
          return;
        }
        if (errorCode === "spam_risk_user_banned_from_posting") {
          onError(
            "Your account is banned from posting. Please contact TikTok support.",
          );
          return;
        }
        if (errorCode === "reached_active_user_cap") {
          onError(
            "Daily quota for active publishing users reached. Please try again later.",
          );
          return;
        }

        setCreatorInfo(data);

        if (onCreatorInfoLoaded && data.data) {
          onCreatorInfoLoaded({
            max_video_duration: data.data.max_video_duration,
          });
        }
      } catch {
        onError("Failed to load TikTok creator information");
      } finally {
        setLoading(false);
      }
    };

    if (accountId) {
      fetchCreatorInfo();
    }
  }, [accountId, onError]);

  // Push initial settings to parent once after load so form state has TikTok metadata (for scheduled/draft)
  useEffect(() => {
    if (!loading && accountId && !hasPushedInitial.current) {
      hasPushedInitial.current = true;
      onChange(settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, accountId]);

  const updateSetting = <K extends keyof TikTokPostSettings>(
    key: K,
    val: TikTokPostSettings[K],
  ) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    onChange(newSettings);
  };

  const privacyOptions = creatorInfo?.data?.privacy_level_options || [
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "SELF_ONLY",
  ];

  const privacyLabels: Record<string, string> = {
    PUBLIC_TO_EVERYONE: "Public",
    MUTUAL_FOLLOW_FRIENDS: "Friends",
    FOLLOWER_OF_CREATOR: "Followers",
    SELF_ONLY: "Only me",
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">Loading TikTok settings...</p>
      </div>
    );
  }

  const hasBrandedContent =
    settings.brand_content_toggle && settings.brand_content;

  const getDeclarationText = () => {
    if (!settings.brand_content_toggle) {
      return "By posting, you agree to TikTok's Music Usage Confirmation";
    }
    if (settings.brand_content) {
      return "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation";
    }
    return "By posting, you agree to TikTok's Music Usage Confirmation";
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          TikTok Post Settings
        </h3>
        {creatorInfo?.data?.creator_nickname && (
          <p className="text-xs text-gray-600 mt-1">
            Posting to:{" "}
            <span className="font-medium">
              {creatorInfo.data.creator_nickname}
            </span>
            {creatorInfo.data.creator_username && (
              <span className="text-gray-500">
                {" "}
                (@{creatorInfo.data.creator_username})
              </span>
            )}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Required settings for TikTok posts
        </p>
      </div>

      {/* Video Title */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Video Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={settings.video_title}
          onChange={(e) =>
            updateSetting("video_title", e.target.value.slice(0, 150))
          }
          placeholder="Enter a title for your video"
          maxLength={150}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        <div className="flex justify-between mt-1">
          {!settings.video_title.trim() && (
            <p className="text-xs text-red-600">A video title is required</p>
          )}
          <p className="text-xs text-gray-400 ml-auto">
            {settings.video_title.length}/150
          </p>
        </div>
      </div>

      {/* Privacy Level */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Privacy Level <span className="text-red-500">*</span>
        </label>
        <select
          value={settings.privacy_level}
          onChange={(e) => {
            const newLevel = e.target.value;
            if (hasBrandedContent && newLevel === "SELF_ONLY") {
              updateSetting("privacy_level", "PUBLIC_TO_EVERYONE");
              return;
            }
            updateSetting("privacy_level", newLevel);
          }}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          required
        >
          <option value="">-- Select privacy level --</option>
          {privacyOptions.map((option) => {
            const isDisabled = hasBrandedContent && option === "SELF_ONLY";
            return (
              <option key={option} value={option} disabled={isDisabled}>
                {privacyLabels[option] || option}
                {isDisabled ? " (not available for branded content)" : ""}
              </option>
            );
          })}
        </select>
        {!settings.privacy_level && (
          <p className="mt-1 text-xs text-red-600">
            You must select a privacy level
          </p>
        )}
        {hasBrandedContent && settings.privacy_level === "SELF_ONLY" && (
          <p className="mt-1 text-xs text-amber-600">
            Branded content visibility cannot be set to private. Privacy has
            been set to Public.
          </p>
        )}
      </div>

      {/* Interaction Toggles */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-900">Allow Interactions</p>
        <div className="space-y-2">
          <label
            className={`flex items-center gap-3 ${creatorInfo?.data?.comment_disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input
              type="checkbox"
              checked={!settings.disable_comment}
              onChange={(e) =>
                updateSetting("disable_comment", !e.target.checked)
              }
              disabled={creatorInfo?.data?.comment_disabled === true}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span
              className={`text-sm ${creatorInfo?.data?.comment_disabled ? "text-gray-500" : "text-gray-700"}`}
            >
              Allow Comments
              {creatorInfo?.data?.comment_disabled && (
                <span className="ml-1 text-xs text-gray-400">
                  (disabled in your settings)
                </span>
              )}
            </span>
          </label>
          <label
            className={`flex items-center gap-3 ${creatorInfo?.data?.duet_disabled || settings.privacy_level === "SELF_ONLY" ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input
              type="checkbox"
              checked={!settings.disable_duet}
              onChange={(e) => updateSetting("disable_duet", !e.target.checked)}
              disabled={
                creatorInfo?.data?.duet_disabled === true ||
                settings.privacy_level === "SELF_ONLY"
              }
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span
              className={`text-sm ${creatorInfo?.data?.duet_disabled || settings.privacy_level === "SELF_ONLY" ? "text-gray-500" : "text-gray-700"}`}
            >
              Allow Duet
              {(creatorInfo?.data?.duet_disabled ||
                settings.privacy_level === "SELF_ONLY") && (
                <span className="ml-1 text-xs text-gray-400">
                  (
                  {settings.privacy_level === "SELF_ONLY"
                    ? "not available with Only me"
                    : "disabled in your settings"}
                  )
                </span>
              )}
            </span>
          </label>
          <label
            className={`flex items-center gap-3 ${creatorInfo?.data?.stitch_disabled || settings.privacy_level === "SELF_ONLY" ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input
              type="checkbox"
              checked={!settings.disable_stitch}
              onChange={(e) =>
                updateSetting("disable_stitch", !e.target.checked)
              }
              disabled={
                creatorInfo?.data?.stitch_disabled === true ||
                settings.privacy_level === "SELF_ONLY"
              }
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span
              className={`text-sm ${creatorInfo?.data?.stitch_disabled || settings.privacy_level === "SELF_ONLY" ? "text-gray-500" : "text-gray-700"}`}
            >
              Allow Stitch
              {(creatorInfo?.data?.stitch_disabled ||
                settings.privacy_level === "SELF_ONLY") && (
                <span className="ml-1 text-xs text-gray-400">
                  (
                  {settings.privacy_level === "SELF_ONLY"
                    ? "not available with Only me"
                    : "disabled in your settings"}
                  )
                </span>
              )}
            </span>
          </label>
        </div>
      </div>

      {/* Brand Disclosure Toggle */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            Content Disclosure
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.brand_content_toggle}
            onClick={() => {
              const enabled = !settings.brand_content_toggle;
              updateSetting("brand_content_toggle", enabled);
              if (!enabled) {
                updateSetting("brand_organic", false);
                updateSetting("brand_content", false);
              }
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              settings.brand_content_toggle ? "bg-emerald-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings.brand_content_toggle
                  ? "translate-x-5"
                  : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Indicate whether this content promotes yourself, a brand, product or
          service.
        </p>
        {settings.brand_content_toggle && (
          <div className="ml-7 space-y-3">
            <p className="text-xs text-gray-500 mb-2">
              Select at least one option (you can select both):
            </p>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={settings.brand_organic}
                onChange={(e) => {
                  updateSetting("brand_organic", e.target.checked);
                  if (
                    e.target.checked &&
                    settings.brand_content &&
                    settings.privacy_level === "SELF_ONLY"
                  ) {
                    updateSetting("privacy_level", "PUBLIC_TO_EVERYONE");
                  }
                }}
                className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4"
              />
              <div className="flex-1">
                <span className="text-sm text-gray-700">Your brand</span>
                {settings.brand_organic && !settings.brand_content && (
                  <p className="text-xs text-amber-700 mt-1 italic">
                    Your video will be labeled as &quot;Promotional
                    content&quot;
                  </p>
                )}
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={settings.brand_content}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateSetting("brand_content", checked);
                  if (checked && settings.privacy_level === "SELF_ONLY") {
                    updateSetting("privacy_level", "PUBLIC_TO_EVERYONE");
                  }
                }}
                className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4"
              />
              <div className="flex-1">
                <span className="text-sm text-gray-700">Branded content</span>
                {settings.brand_content && !settings.brand_organic && (
                  <p className="text-xs text-amber-700 mt-1 italic">
                    Your video will be labeled as &quot;Paid partnership&quot;
                  </p>
                )}
              </div>
            </label>
            {settings.brand_content_toggle &&
              !settings.brand_organic &&
              !settings.brand_content && (
                <p className="text-xs text-red-600 ml-7">
                  You need to indicate if your content promotes yourself, a
                  third party, or both.
                </p>
              )}
            {settings.brand_organic && settings.brand_content && (
              <p className="text-xs text-amber-700 ml-7 italic">
                Your video will be labeled as &quot;Paid partnership&quot;
              </p>
            )}
          </div>
        )}
      </div>

      {/* Send to TikTok as Draft */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">
              Send to TikTok as Draft
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Post will be saved as draft inside of TikTok instead of publishing
              immediately. Check your TikTok inbox notifications to continue
              editing and publish.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.post_as_draft}
            onClick={() =>
              updateSetting("post_as_draft", !settings.post_as_draft)
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              settings.post_as_draft ? "bg-emerald-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings.post_as_draft ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mark as AI-Generated Content */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">
              Mark as AI-Generated Content
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              If enabled, the video will be labeled with &quot;Creator labeled
              as AI-generated&quot; tag in video&apos;s description.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.mark_ai_generated}
            onClick={() =>
              updateSetting("mark_ai_generated", !settings.mark_ai_generated)
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              settings.mark_ai_generated ? "bg-emerald-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings.mark_ai_generated ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Declaration Text */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-600 italic">{getDeclarationText()}</p>
      </div>

      {/* Max Video Duration Info */}
      {creatorInfo?.data?.max_video_duration && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs text-blue-800">
            Maximum video duration: {creatorInfo.data.max_video_duration}{" "}
            seconds
          </p>
        </div>
      )}
    </div>
  );
}

/*
// ─── Previous simplified version (no creator-info fetch) ──────────────────────

"use client";

import { useState, useEffect } from "react";

type TikTokSettingsProps = {
  accountId: string;
  value: TikTokPostSettings;
  onChange: (settings: TikTokPostSettings) => void;
  // When "photo", only Allow Comments is shown (Duet/Stitch do not apply to photo posts).
  mediaType?: "video" | "photo";
};

export type TikTokPostSettings = {
  privacy_level: string;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  brand_content_toggle: boolean;
  brand_organic: boolean;
  brand_content: boolean;
};

const DEFAULT_SETTINGS: TikTokPostSettings = {
  privacy_level: "",
  disable_comment: true,
  disable_duet: true,
  disable_stitch: true,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
};

export function TikTokSettings({
  value,
  onChange,
  mediaType,
}: TikTokSettingsProps) {
  const isPhotoOnly = mediaType === "photo";
  const [settings, setSettings] = useState<TikTokPostSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...value,
    brand_organic: value.brand_organic ?? false,
    brand_content: value.brand_content ?? false,
  }));

  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      ...value,
      brand_organic: value.brand_organic ?? false,
      brand_content: value.brand_content ?? false,
    }));
  }, [value]);

  const isPrivate = settings.privacy_level === "SELF_ONLY";
  const brandedContentActive =
    settings.brand_content_toggle && settings.brand_content;

  const updateSetting = <K extends keyof TikTokPostSettings>(
    key: K,
    val: TikTokPostSettings[K],
  ) => {
    let newSettings = { ...settings, [key]: val };

    if (key === "privacy_level" && val === "SELF_ONLY") {
      newSettings = { ...newSettings, disable_duet: true, disable_stitch: true };
    }

    if (key === "brand_content_toggle" && val === false) {
      newSettings = { ...newSettings, brand_organic: false, brand_content: false };
    }

    if (key === "brand_content" && val === true && settings.privacy_level === "SELF_ONLY") {
      newSettings = {
        ...newSettings,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: settings.disable_duet,
        disable_stitch: settings.disable_stitch,
      };
    }

    setSettings(newSettings);
    onChange(newSettings);
  };

  const getDeclarationText = () => {
    if (!settings.brand_content_toggle) {
      return (
        <>
          By posting, you agree to TikTok&apos;s{" "}
          <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
            Music Usage Confirmation
          </a>
        </>
      );
    }
    if (settings.brand_content) {
      return (
        <>
          By posting, you agree to TikTok&apos;s{" "}
          <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
            Branded Content Policy
          </a>{" "}
          and{" "}
          <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
            Music Usage Confirmation
          </a>
        </>
      );
    }
    return (
      <>
        By posting, you agree to TikTok&apos;s{" "}
        <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
          Music Usage Confirmation
        </a>
      </>
    );
  };

  const getBrandLabel = () => {
    if (settings.brand_organic && settings.brand_content) return "Your photo/video will be labeled as 'Paid partnership'";
    if (settings.brand_organic) return "Your photo/video will be labeled as 'Promotional content'";
    if (settings.brand_content) return "Your photo/video will be labeled as 'Paid partnership'";
    return null;
  };

  const brandLabel = getBrandLabel();
  const noBrandOptionSelected = settings.brand_content_toggle && !settings.brand_organic && !settings.brand_content;

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text mb-1">TikTok Post Settings</h3>
        <p className="text-xs text-text-muted mt-1">Required settings for TikTok posts</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-2">
          Privacy Level <span className="text-destructive">*</span>
        </label>
        <select
          value={settings.privacy_level}
          onChange={(e) => updateSetting("privacy_level", e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          <option value="">Select privacy level</option>
          <option value="PUBLIC_TO_EVERYONE">Public</option>
          <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
          <option value="SELF_ONLY" disabled={brandedContentActive} title={brandedContentActive ? "Branded content visibility cannot be set to private." : undefined}>
            Only me{brandedContentActive ? " (unavailable for branded content)" : ""}
          </option>
        </select>
        <p className="mt-2 text-xs text-text-muted">
          Videos post as private until TikTok approves our app. Change to public on TikTok after posting.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-text">Allow Interactions</p>
        <div className="space-y-2">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={!settings.disable_comment} onChange={(e) => updateSetting("disable_comment", !e.target.checked)} className="rounded border-border text-accent focus:ring-accent size-4" />
            <span className="text-sm text-text">Allow Comments</span>
          </label>
          {!isPhotoOnly && (
            <>
              <label className={`flex items-center gap-3 ${isPrivate ? "cursor-not-allowed opacity-50" : ""}`}>
                <input type="checkbox" checked={!settings.disable_duet} onChange={(e) => updateSetting("disable_duet", !e.target.checked)} disabled={isPrivate} className="rounded border-border text-accent focus:ring-accent size-4 disabled:cursor-not-allowed" />
                <span className="text-sm text-text">
                  Allow Duet
                  {isPrivate && <span className="ml-1 text-xs text-text-muted">(not available with Only me)</span>}
                </span>
              </label>
              <label className={`flex items-center gap-3 ${isPrivate ? "cursor-not-allowed opacity-50" : ""}`}>
                <input type="checkbox" checked={!settings.disable_stitch} onChange={(e) => updateSetting("disable_stitch", !e.target.checked)} disabled={isPrivate} className="rounded border-border text-accent focus:ring-accent size-4 disabled:cursor-not-allowed" />
                <span className="text-sm text-text">
                  Allow Stitch
                  {isPrivate && <span className="ml-1 text-xs text-text-muted">(not available with Only me)</span>}
                </span>
              </label>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={settings.brand_content_toggle} onChange={(e) => updateSetting("brand_content_toggle", e.target.checked)} className="rounded border-border text-accent focus:ring-accent size-4" />
          <span className="text-sm font-medium text-text">Content Disclosure</span>
        </label>
        <p className="text-xs text-text-muted ml-7">Indicate whether this content promotes yourself, a brand, product or service.</p>

        {settings.brand_content_toggle && (
          <div className="ml-7 space-y-3">
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={settings.brand_organic} onChange={(e) => updateSetting("brand_organic", e.target.checked)} className="mt-0.5 rounded border-border text-accent focus:ring-accent size-4" />
              <div className="flex-1">
                <span className="text-sm font-medium text-text">Your brand</span>
                <p className="text-xs text-text-muted">You are promoting yourself or your own business.</p>
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={settings.brand_content} onChange={(e) => updateSetting("brand_content", e.target.checked)} className="mt-0.5 rounded border-border text-accent focus:ring-accent size-4" />
              <div className="flex-1">
                <span className="text-sm font-medium text-text">Branded content</span>
                <p className="text-xs text-text-muted">You are promoting another brand or a third party.</p>
              </div>
            </label>
            {brandLabel && <p className="text-xs text-amber-600 dark:text-amber-400 italic">{brandLabel}</p>}
            {noBrandOptionSelected && <p className="text-xs text-destructive">You need to indicate if your content promotes yourself, a third party, or both.</p>}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-xs text-text-muted italic">{getDeclarationText()}</p>
      </div>
    </div>
  );
}
*/
